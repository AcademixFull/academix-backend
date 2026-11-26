/** Only technical error metadata leaves Academix; never request/user payloads. */
export function sanitizeEvent<T extends { exception?: { values?: Array<{ type?: string; value?: string; stacktrace?: { frames?: Array<{ filename?: string; function?: string; lineno?: number; colno?: number; in_app?: boolean }> } }> }; event_id?: string; timestamp?: number; platform?: string; level?: unknown; release?: string; environment?: string }>(event: T): T {
  return {
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    level: event.level,
    release: event.release,
    environment: event.environment,
    exception: event.exception ? { values: event.exception.values?.map(value => ({
      type: value.type === 'TypeError' || value.type === 'RangeError' || value.type === 'SyntaxError' ? value.type : 'Error',
      value: 'Error interno de Academix (consultar traza)',
      stacktrace: value.stacktrace ? { frames: value.stacktrace.frames?.map(frame => ({
        filename: frame.filename?.split(/[?#]/)[0], function: frame.function,
        lineno: frame.lineno, colno: frame.colno, in_app: frame.in_app,
      })) } : undefined,
    })) } : undefined,
  } as T;
}
