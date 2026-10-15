import { Controller, Post, Body, HttpCode, HttpStatus, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { ChatService } from './chat.service';
import { ChatRequestDto } from './dto/chat-request.dto';
import { RagResponseDto } from './chat.interfaces';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async chat(@Body() dto: ChatRequestDto): Promise<RagResponseDto> {
    return this.chatService.handleChat(dto);
  }

  /**
   * Server-Sent Events (SSE) streaming endpoint.
   * Incremental text tokens arrive via 'delta' events, and verified citations arrive in 'done'.
   */
  @Post('stream')
  async chatStream(
    @Body() dto: ChatRequestDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof (res as any).flushHeaders === 'function') {
      (res as any).flushHeaders();
    }

    const abortController = new AbortController();
    req.on('close', () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    });

    const sendEvent = (event: string, data: any) => {
      if (!res.writableEnded) {
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
      );

      sendEvent('done', finalResult);
    } catch (err: any) {
      if (!abortController.signal.aborted) {
        sendEvent('error', {
          message: err.message || 'Stream processing encountered an error.',
          code: 'STREAM_ERROR',
        });
      }
    } finally {
      if (!res.writableEnded) {
        res.end();
      }
    }
  }
}
