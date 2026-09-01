"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/src/auth";
import { DomainError } from "@/src/domain/errors";
import { startStripeCheckout } from "@/src/services/checkout";
import { getPublicShopContext } from "@/src/services/public-context";

export type PayState = { error?: string };

export async function payOrder(
  _prev: PayState,
  formData: FormData,
): Promise<PayState> {
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return { error: "Bestellung fehlt." };

  const session = await auth();
  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/bestellung/${orderId}`)}`);
  }
  const shop = await getPublicShopContext();
  if (!shop) return { error: "Shop nicht verfügbar." };

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";

  let url: string;
  try {
    const result = await startStripeCheckout(shop.ctx, {
      orderId,
      userId: session.user.id,
      baseUrl: `${proto}://${host}`,
    });
    url = result.url;
  } catch (error) {
    if (error instanceof DomainError) {
      return { error: error.message };
    }
    throw error;
  }

  redirect(url);
}
