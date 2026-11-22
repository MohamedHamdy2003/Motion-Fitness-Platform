import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../common/auth.guard';
import { ApiRequest, parse, uuid } from '../../common/http';
import {
  exerciseCompletionInput,
  workoutSetInput,
  workoutSetNumber,
} from './workout.dto';
import { WorkoutService } from './workout.service';

@Controller('me/workouts')
@UseGuards(AuthGuard)
export class WorkoutController {
  constructor(
    @Inject(WorkoutService) private readonly workouts: WorkoutService,
  ) {}

  @Get('current')
  current(@Req() req: ApiRequest) {
    return this.workouts.current(req.principal.userId);
  }

  @Post('days/:dayId/start')
  start(@Req() req: ApiRequest, @Param('dayId') dayId: string) {
    return this.workouts.start(req.principal.userId, parse(uuid, dayId));
  }

  @Get(':sessionId')
  get(@Req() req: ApiRequest, @Param('sessionId') sessionId: string) {
    return this.workouts.get(req.principal.userId, parse(uuid, sessionId));
  }

  @Put(':sessionId/exercises/:exerciseId/sets/:setNumber')
  saveSet(
    @Req() req: ApiRequest,
    @Param('sessionId') sessionId: string,
    @Param('exerciseId') exerciseId: string,
    @Param('setNumber') setNumber: string,
    @Body() body: unknown,
  ) {
    return this.workouts.saveSet(
      req.principal.userId,
      parse(uuid, sessionId),
      parse(uuid, exerciseId),
      parse(workoutSetNumber, setNumber),
      parse(workoutSetInput, body),
    );
  }

  @Put(':sessionId/exercises/:exerciseId/completion')
  exerciseCompletion(
    @Req() req: ApiRequest,
    @Param('sessionId') sessionId: string,
    @Param('exerciseId') exerciseId: string,
    @Body() body: unknown,
  ) {
    return this.workouts.saveExerciseCompletion(
      req.principal.userId,
      parse(uuid, sessionId),
      parse(uuid, exerciseId),
      parse(exerciseCompletionInput, body).completed,
    );
  }

  @Post(':sessionId/complete')
  finish(@Req() req: ApiRequest, @Param('sessionId') sessionId: string) {
    return this.workouts.finish(req.principal.userId, parse(uuid, sessionId));
  }

  @Post(':sessionId/abandon')
  abandon(@Req() req: ApiRequest, @Param('sessionId') sessionId: string) {
    return this.workouts.abandon(req.principal.userId, parse(uuid, sessionId));
  }
}
