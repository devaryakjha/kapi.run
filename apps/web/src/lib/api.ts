import type {
  CreateSessionInput,
  JoinSessionInput,
  KapiSession,
  MenuItem,
  Participant,
  ParticipantItem,
  Restaurant,
  SubmitItemInput,
} from "@kapi/spec";

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

async function request<TResponse>(path: string, init?: RequestInit): Promise<TResponse> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
    ...init,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<TResponse>;
}

export function getRestaurants() {
  return request<{ restaurants: Restaurant[] }>("/restaurants");
}

export function getRestaurantMenu(restaurantId: string) {
  return request<{ menu: MenuItem[] }>(`/restaurants/${restaurantId}/menu`);
}

export function createSession(input: CreateSessionInput) {
  return request<{ session: KapiSession }>("/sessions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getSession(sessionId: string) {
  return request<{ session: KapiSession }>(`/sessions/${sessionId}`);
}

export function joinSession(sessionId: string, input: JoinSessionInput) {
  return request<{ participant: Participant; session: KapiSession }>(
    `/sessions/${sessionId}/join`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function submitItem(sessionId: string, input: SubmitItemInput) {
  return request<{ item: ParticipantItem; session: KapiSession }>(
    `/sessions/${sessionId}/items`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function lockSession(sessionId: string) {
  return request<{ session: KapiSession }>(`/sessions/${sessionId}/lock`, {
    method: "POST",
  });
}
