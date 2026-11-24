import { contactRepository, type ContactRepository } from "../repositories/contact.repository";
import type { SubmitContactMessageInput } from "../schemas/contact.schemas";

export function createContactService(repository: ContactRepository) {
  return {
    submit(input: SubmitContactMessageInput) {
      return repository.create(input);
    },
  };
}

export const contactService = createContactService(contactRepository);
