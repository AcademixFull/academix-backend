import { supabaseAdmin } from "../config/supabase";
import { subscriptionFailure } from "../repositories/subscription.repository";
export async function assertCourseLearningAccess(userId: string, courseId: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc("academix_assert_course_learning_access", { p_user_id: userId, p_course_id: courseId });
  if (error) throw subscriptionFailure(error);
}
export async function getCourseAccessExpiry(userId: string, courseId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.rpc("academix_course_access_expiry", { p_user_id: userId, p_course_id: courseId });
  if (error) throw subscriptionFailure(error);
  if (data === null) return null;
  if (typeof data !== "string" || !Number.isFinite(Date.parse(data))) throw subscriptionFailure(null);
  return data;
}
