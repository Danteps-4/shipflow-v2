import { getActiveStore, addStore, disconnectStore } from "./tnStores";

export interface TnTokens {
  access_token: string;
  token_type: string;
  scope: string;
  user_id: number;
}

export function readTokens(sfUserId: string): TnTokens | null {
  const store = getActiveStore(sfUserId);
  if (!store) return null;
  return { access_token: store.access_token, token_type: "bearer", scope: "", user_id: store.user_id };
}

export function writeTokens(sfUserId: string, data: TnTokens & { store_name?: string }): void {
  addStore(sfUserId, {
    access_token: data.access_token,
    user_id: data.user_id,
    store_name: data.store_name ?? `Tienda ${data.user_id}`,
    connected_at: new Date().toISOString(),
  });
}

export function deleteTokens(sfUserId: string): void {
  const store = getActiveStore(sfUserId);
  if (store) disconnectStore(sfUserId, store.user_id);
}
