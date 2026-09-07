import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "./api";

function base64UrlToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function useVapidKey() {
  return useQuery({
    queryKey: ["vapid-key"],
    queryFn: () => apiGet<{ publicKey: string | null }>("/api/push/vapid-key"),
    staleTime: Infinity,
  });
}

export function useSubscribePush() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vapidPublicKey: string) => {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) return existing;

      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(vapidPublicKey).buffer as ArrayBuffer,
      });

      const json = sub.toJSON();
      await apiPost("/api/push/subscribe", {
        endpoint: sub.endpoint,
        keys: {
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
        },
      });

      return sub;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["push-status"] });
    },
  });
}

export function useUnsubscribePush() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (sub) {
        await apiPost("/api/push/unsubscribe", { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["push-status"] });
    },
  });
}

export function usePushStatus() {
  return useQuery({
    queryKey: ["push-status"],
    queryFn: async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        return { supported: false, subscribed: false, permission: "denied" as PermissionState };
      }
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      return {
        supported: true,
        subscribed: sub !== null,
        permission: Notification.permission as PermissionState,
      };
    },
    staleTime: 30_000,
  });
}
