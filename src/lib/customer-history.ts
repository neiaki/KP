import type { Profile, ServiceTicket, Transaction } from "@/types";

/*
 * Filter riwayat milik pelanggan untuk mode demo.
 *
 * Mode live sudah memfilter transaksi dan tiket di server lewat customer_id,
 * tetapi mode demo membaca seluruh isi localStorage. Tanpa filter yang sama,
 * pelanggan bisa melihat faktur dan tiket milik pelanggan lain. Transaksi lama
 * belum punya customer_id, jadi nomor HP dipakai sebagai cadangan.
 */

type TransactionOwner = Pick<Profile, "id" | "phone_number">;
type TicketOwner = Pick<Profile, "id" | "full_name" | "phone_number">;

export function filterCustomerTransactions(
  transactions: Transaction[],
  profile: TransactionOwner | null
): Transaction[] {
  if (!profile) return [];

  return transactions.filter((transaction) => {
    if (transaction.customer_id) {
      return transaction.customer_id === profile.id;
    }
    return Boolean(
      profile.phone_number &&
        transaction.customer_phone === profile.phone_number
    );
  });
}

export function filterCustomerTickets(
  tickets: ServiceTicket[],
  profile: TicketOwner | null
): ServiceTicket[] {
  if (!profile) return [];

  return tickets.filter((ticket) => {
    if (ticket.customer_id) {
      return ticket.customer_id === profile.id;
    }
    if (
      profile.phone_number &&
      ticket.customer_phone === profile.phone_number
    ) {
      return true;
    }
    return (
      ticket.customer_name.toLowerCase() === profile.full_name.toLowerCase()
    );
  });
}
