import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MemoryService } from './memory.service';
import { CreateMemoryDto } from './dto/create-memory.dto';
import { UpdateMemoryDto } from './dto/update-memory.dto';
import { AuthGuard } from '../auth/guards/auth.guard';

@Controller('memory')
@UseGuards(AuthGuard)
export class MemoryController {
  constructor(private readonly memoryService: MemoryService) {}

  @Get()
  async listMemories(@Request() req: any) {
    return this.memoryService.listUserMemories(req.user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createMemory(@Request() req: any, @Body() dto: CreateMemoryDto) {
    return this.memoryService.createMemory(req.user.id, dto);
  }

  @Patch(':id')
  async updateMemory(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateMemoryDto,
  ) {
    return this.memoryService.updateMemory(id, req.user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteMemory(@Request() req: any, @Param('id') id: string) {
    return this.memoryService.deleteMemory(id, req.user.id);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  async clearAllMemories(@Request() req: any) {
    return this.memoryService.clearAllMemories(req.user.id);
  }
}
