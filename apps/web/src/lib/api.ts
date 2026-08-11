export const API_URL =
  import.meta.env.VITE_KAPI_API_URL ?? 'http://localhost:3001'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const { headers, ...rest } = init ?? {}
  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...headers },
  })

  if (!response.ok) {
    const body = (await response
      .json()
      .catch(() => ({ error: 'Request failed.' }))) as { error?: string }
    throw new ApiError(body.error ?? 'Request failed.', response.status)
  }

  return response.json() as Promise<T>
}
