import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../errors/app-error";
import type { SimulatedPlanPurchase } from "../schemas/subscription.schemas";
import type { PlanReceipt, SubscriptionPlan, SubscriptionSummary } from "../types/subscription.types";

export function subscriptionFailure(error: { message?: string } | null): AppError {
  const messages: Record<string, [number, string]> = {
    PLAN_NOT_AVAILABLE: [422, "El plan no está disponible para compra."],
    ORGANIZATION_REQUIRED: [422, "Selecciona la organización que recibirá el plan."],
    ORGANIZATION_ADMIN_REQUIRED: [403, "Se requiere administrar esta organización."],
    ORGANIZATION_SUBSCRIPTION_REQUIRED: [403, "La organización necesita una suscripción vigente para esta función."],
    SUBSCRIPTION_REQUIRED: [403, "Necesitas una suscripción vigente para acceder a este curso."],
    ORGANIZATION_MEMBERSHIP_REQUIRED: [403, "No tienes una membresía activa en esta organización."],
    ENROLLMENT_REQUIRED: [403, "Necesitas una inscripción activa para acceder al curso."],
    COURSE_NOT_AVAILABLE: [404, "El curso no está disponible."],
    USER_NOT_FOUND: [403, "La cuenta no está activa."],
    IDEMPOTENCY_CONFLICT: [409, "Esta confirmación ya se utilizó para otra compra."],
    ORGANIZATION_DELETE_DENIED: [403, "Solo el propietario que administra la organización puede eliminarla."],
    ORGANIZATION_NOT_FOUND: [404, "La organización no está disponible."],
  };
  const code = error?.message ?? "";
  const mapped = messages[code];
  return mapped ? new AppError(mapped[0], code, mapped[1]) : new AppError(502, "SUBSCRIPTION_DATABASE_ERROR", "No fue posible consultar la suscripción.");
}
export interface SubscriptionRepository {
  plans(): Promise<SubscriptionPlan[]>;
  list(userId: string, page: number, limit: number): Promise<{ records: SubscriptionSummary[]; total: number }>;
  purchase(userId: string, input: SimulatedPlanPurchase): Promise<PlanReceipt>;
  assertOrganizationPaid(organizationId: string): Promise<void>;
  transactions(userId: string, page: number, limit: number): Promise<{ records: Array<PlanReceipt & { createdAt: string }>; total: number }>;
}
export const subscriptionRepository: SubscriptionRepository = {
  async transactions(userId, page, limit) {
    const offset = (page - 1) * limit;
    const { data, error, count } = await supabaseAdmin.from("transacciones_planes").select("resultado,fecha_creacion", { count: "exact" }).eq("fk_usuario", userId).order("fecha_creacion", { ascending: false }).order("id_transaccion").range(offset, offset + limit - 1);
    if (error) throw subscriptionFailure(error);
    return { records: (data ?? []).map((row) => ({ ...(row.resultado as PlanReceipt), createdAt: String(row.fecha_creacion) })), total: count ?? 0 };
  },
  async plans() {
    const { data, error } = await supabaseAdmin.from("planes").select("id_plan,nombre,audiencia,precio_mxn,meses,beneficios,comprable").eq("activo", true).order("orden");
    if (error) throw subscriptionFailure(error);
    return (data ?? []).map((row) => ({ id: String(row.id_plan), name: String(row.nombre), audience: row.audiencia as SubscriptionPlan["audience"], priceMxn: row.precio_mxn == null ? null : Number(row.precio_mxn), months: row.meses == null ? null : Number(row.meses), features: row.beneficios as string[], purchasable: Boolean(row.comprable) }));
  },
  async list(userId, page, limit) {
    const { data, error } = await supabaseAdmin.rpc("academix_list_subscriptions", { p_user_id: userId, p_page: page, p_limit: limit });
    if (error) throw subscriptionFailure(error);
    return data as { records: SubscriptionSummary[]; total: number };
  },
  async purchase(userId, input) {
    const { data, error } = await supabaseAdmin.rpc("academix_purchase_plan", { p_user_id: userId, p_plan_id: input.planId, p_organization_id: input.organizationId ?? null, p_idempotency_key: input.idempotencyKey });
    if (error) throw subscriptionFailure(error);
    return data as PlanReceipt;
  },
  async assertOrganizationPaid(organizationId) {
    const { data, error } = await supabaseAdmin.rpc("academix_organization_has_subscription", { p_organization_id: organizationId });
    if (error) throw subscriptionFailure(error);
    if (!data) throw subscriptionFailure({ message: "ORGANIZATION_SUBSCRIPTION_REQUIRED" });
  },
};
