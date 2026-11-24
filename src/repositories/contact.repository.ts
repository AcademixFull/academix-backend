import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../errors/app-error";
import type { SubmitContactMessageInput } from "../schemas/contact.schemas";
import type { ContactMessageReceipt } from "../types/contact.types";

export interface ContactRepository {
  create(input: SubmitContactMessageInput): Promise<ContactMessageReceipt>;
}

interface ContactMessageRow {
  id_mensaje: string;
  fecha_creacion: string;
}

export const contactRepository: ContactRepository = {
  async create(input) {
    const { data, error } = await supabaseAdmin
      .from("mensajes_contacto")
      .insert({
        nombre: input.fullName,
        correo: input.email.toLowerCase(),
        asunto: input.subject,
        mensaje: input.message,
      })
      .select("id_mensaje,fecha_creacion")
      .single();

    if (error || !data) {
      throw new AppError(
        502,
        "CONTACT_MESSAGE_NOT_SAVED",
        "No fue posible enviar el mensaje. Intenta nuevamente."
      );
    }

    const row = data as ContactMessageRow;
    return { id: row.id_mensaje, submittedAt: row.fecha_creacion };
  },
};
