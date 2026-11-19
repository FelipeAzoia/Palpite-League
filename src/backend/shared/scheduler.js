// Agendador de tarefas periódicas em processo (ADR-0006, implementado pela SPEC-013).
// - cada tarefa tem intervalo configurável e roda logo após start() e depois a cada intervalo;
// - duas execuções da mesma tarefa nunca se sobrepõem: o próximo disparo só é agendado
//   quando a execução atual termina, e runNow() devolve a execução em andamento;
// - a falha de uma execução é registrada e não interrompe o agendador;
// - os testes acionam as tarefas com runNow(), sem esperar o tempo passar.

export function createScheduler({ logger, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const tasks = new Map()
  let started = false

  function register(name, intervalMs, run) {
    if (typeof name !== 'string' || name.trim() === '') throw new TypeError('task name is required')
    if (tasks.has(name)) throw new Error(`task already registered: ${name}`)
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) throw new RangeError('task interval must be positive')
    if (typeof run !== 'function') throw new TypeError('task function is required')
    tasks.set(name, { name, intervalMs, run, running: null, timer: null })
  }

  function runNow(name) {
    const task = tasks.get(name)
    if (!task) throw new Error(`unknown task: ${name}`)
    if (task.running) return task.running
    task.running = (async () => {
      try {
        return await task.run()
      } catch {
        logger?.error('scheduler', 'task_failed')
        return undefined
      } finally {
        task.running = null
      }
    })()
    return task.running
  }

  function scheduleNext(task) {
    if (!started) return
    task.timer = setTimer(async () => {
      task.timer = null
      await runNow(task.name)
      scheduleNext(task)
    }, task.intervalMs)
    task.timer?.unref?.()
  }

  // Executa cada tarefa imediatamente e agenda a seguinte; devolve as execuções iniciais.
  function start() {
    if (started) return Promise.resolve([])
    started = true
    return Promise.all([...tasks.values()].map(async (task) => {
      const result = await runNow(task.name)
      scheduleNext(task)
      return result
    }))
  }

  function stop() {
    started = false
    for (const task of tasks.values()) {
      if (task.timer) clearTimer(task.timer)
      task.timer = null
    }
  }

  return { register, runNow, start, stop, isStarted: () => started }
}
