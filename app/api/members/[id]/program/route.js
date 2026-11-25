import { guarded, requireMember } from '../../../../../lib/http';
import { getActiveStrategy } from '../../../../../lib/strategies';
import { getWorkerStatus, listCommands, liveSigningReady } from '../../../../../lib/trading';

export const dynamic = 'force-dynamic';

// 프로그램 탭: 모드·자동실행 설정, 승인된 전략, 최근 명령, 노트북 프로그램 연결 상태
export const GET = guarded(async (request, { id }) => {
  const member = await requireMember(id);
  const [strategy, commands, worker] = await Promise.all([
    getActiveStrategy(member),
    listCommands(id),
    getWorkerStatus(),
  ]);
  return Response.json({
    program: {
      mode: member.mode,
      autoRun: member.autoRun,
      schedule: member.schedule,
      paperCapitalUsdt: member.paperCapitalUsdt,
      activeStrategyVersion: member.activeStrategyVersion,
      nextRunAt: worker.nextRuns?.[id] || null, // 노트북 프로그램이 예약한 다음 자동 실행
    },
    strategy: strategy
      ? { version: strategy.version, name: strategy.name, summary: strategy.summary, rules: strategy.rules }
      : null,
    commands,
    worker,
    liveReady: liveSigningReady(),
  });
});
