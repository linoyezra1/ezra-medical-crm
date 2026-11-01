/**
 * לוגים אחידים להנפקת תעודות — מופיעים בלוגי Railway / השרת.
 * לא מדפיסים PIN או מפתחות.
 */

const PREFIX = "[certificates:issue]"

export function certLog(
  stage: string,
  message: string,
  meta?: Record<string, unknown>,
) {
  if (meta && Object.keys(meta).length) {
    console.log(PREFIX, stage, message, meta)
  } else {
    console.log(PREFIX, stage, message)
  }
}

export function certWarn(
  stage: string,
  message: string,
  meta?: Record<string, unknown>,
) {
  if (meta && Object.keys(meta).length) {
    console.warn(PREFIX, stage, message, meta)
  } else {
    console.warn(PREFIX, stage, message)
  }
}

export function certError(
  stage: string,
  message: string,
  err?: unknown,
  meta?: Record<string, unknown>,
) {
  const errInfo =
    err instanceof Error
      ? { name: err.name, message: err.message, stack: err.stack }
      : err != null
        ? { raw: String(err) }
        : undefined
  console.error(PREFIX, stage, message, {
    ...(meta || {}),
    ...(errInfo ? { err: errInfo } : {}),
  })
}
