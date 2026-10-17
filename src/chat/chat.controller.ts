import { Controller, Post, Body, HttpCode, HttpStatus, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { ChatService } from './chat.service';
import { ChatRequestDto } from './dto/chat-request.dto';
import { RagResponseDto } from './chat.interfaces';
import { OptionalAuthGuard } from '../auth/guards/optional-auth.guard';

@Controller('chat')
@UseGuards(OptionalAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async chat(@Body() dto: ChatRequestDto, @Req() req: any): Promise<RagResponseDto> {
    const userId = req.user?.id;
    return this.chatService.handleChat(dto, userId);
  }

  /**
   * Server-Sent Events (SSE) streaming endpoint.
   * Incremental text tokens arrive via 'delta' events, and verified citations arrive in 'done'.
   */
  @Post('stream')
  async chatStream(
    @Body() dto: ChatRequestDto,
    @Req() req: any,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user?.id;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof (res as any).flushHeaders === 'function') {
      (res as any).flushHeaders();
    }

    // Immediately flush initial SSE comment to establish socket through reverse proxies
    res.write(': connected\n\n');
    if (typeof (res as any).flush === 'function') {
      (res as any).flush();
    }

    const abortController = new AbortController();
    let isFinished = false;

    // Listen to client disconnect on the response stream (NOT the incoming request upload stream)
    res.on('close', () => {
      if (!isFinished && !res.writableEnded) {
        abortController.abort();
      }
    });

    // 12-second heartbeat to prevent proxy read timeouts (e.g. Render / Cloudflare ECONNRESET)
    const heartbeat = setInterval(() => {
      if (!res.writableEnded && !isFinished) {
        res.write(': keepalive\n\n');
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }
      }
    }, 12000);

    const sendEvent = (event: string, data: any) => {
      if (!res.writableEnded && !isFinished) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }
      }
    };

    try {
      const finalResult = await this.chatService.handleChatStream(
        dto,
        (info) => sendEvent('start', info),
        (chunk) => sendEvent('delta', { text: chunk }),
        abortController.signal,
        userId,
      );

      if (!abortController.signal.aborted) {
        sendEvent('done', finalResult);
      }
    } catch (err: any) {
      if (!abortController.signal.aborted && err?.message !== 'STREAM_ABORTED_BY_CLIENT') {
        sendEvent('error', {
          message: err.message || 'Stream processing encountered an error.',
          code: 'STREAM_ERROR',
        });
      }
    } finally {
      isFinished = true;
      clearInterval(heartbeat);
      if (!res.writableEnded) {
        res.end();
      }
    }
  }
}
