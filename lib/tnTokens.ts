import { getActiveStoreForUser, addStore, disconnectStore } from "./tnStores";

export interface TnTokens {
  access_token: string;
  token_type: string;
  scope: string;
  user_id: number;
}

export function readTokens(sfUserId: string | null): TnTokens | null {
  const store = getActiveStoreForUser(sfUserId);
  if (!store) return null;
  return { access_token: store.access_token, token_type: "bearer", scope: "", user_id: store.user_id };
}

export function writeTokens(data: TnTokens & { store_name?: string }, sfUserId?: string | null): void {
  addStore({
    access_token: data.access_token,
    user_id: data.user_id,
    store_name: data.store_name ?? `Tienda ${data.user_id}`,
    connected_at: new Date().toISOString(),
  }, sfUserId);
}

export function deleteTokens(sfUserId: string | null): void {
  const store = getActiveStoreForUser(sfUserId);
  if (store) disconnectStore(store.user_id);
}
