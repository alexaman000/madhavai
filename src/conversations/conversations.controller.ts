import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { AuthGuard } from '../auth/guards/auth.guard';

@Controller('conversations')
@UseGuards(AuthGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  async listConversations(
    @Request() req: any,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const parsedLimit = limit ? Math.min(Math.max(parseInt(limit, 10), 1), 100) : 50;
    const parsedOffset = offset ? Math.max(parseInt(offset, 10), 0) : 0;
    return this.conversationsService.listUserConversations(req.user.id, parsedLimit, parsedOffset);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createConversation(@Request() req: any, @Body() dto: CreateConversationDto) {
    return this.conversationsService.createConversation(req.user.id, dto);
  }

  @Get(':id')
  async getConversation(@Request() req: any, @Param('id') id: string) {
    return this.conversationsService.getConversation(id, req.user.id);
  }

  @Patch(':id')
  async updateConversation(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.conversationsService.updateConversation(id, req.user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteConversation(@Request() req: any, @Param('id') id: string) {
    return this.conversationsService.deleteConversation(id, req.user.id);
  }
}
