// 모든 매매 작업(명령, 자동 실행, 시세 갱신)을 한 줄로 세워 하나씩 처리한다.
// 같은 포지션을 두 작업이 동시에 고치는 일을 막는다.

let tail = Promise.resolve();

export function enqueue(fn) {
  const run = tail.then(() => fn());
  tail = run.catch(() => {});
  return run;
}
