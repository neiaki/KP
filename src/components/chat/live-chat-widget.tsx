"use client";

import React, { useState, useRef, useEffect } from "react";
import { useStore } from "@/context/store-context";
import { formatIDR } from "@/lib/utils";
import {
  MessageCircle,
  X,
  Send,
  Sparkles,
  Smartphone,
  Wrench,
  ArrowLeftRight,
  ExternalLink,
  Bot,
  User,
  Clock,
  CheckCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface ChatMessage {
  id: string;
  sender: "bot" | "user";
  text: string;
  timestamp: string;
  actionLink?: {
    label: string;
    href: string;
  };
}

export function LiveChatWidget() {
  const { storeSettings, serviceTickets, products, inventoryUnits } = useStore();

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"livechat" | "whatsapp">("livechat");
  const [unreadCount, setUnreadCount] = useState(1);

  // Chat conversation state
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "m-welcome",
      sender: "bot",
      text: `Halo! Selamat datang di Layanan Pelanggan ${storeSettings.store_name}. Ada yang bisa kami bantu seputar stok smartphone, estimasi biaya servis, atau tukar tambah?`,
      timestamp: "Baru saja",
    },
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [isOpen, messages]);

  const handleSendMessage = (textToSend?: string) => {
    const text = textToSend || inputMessage;
    if (!text.trim()) return;

    const userMsg: ChatMessage = {
      id: `m-user-${Date.now()}`,
      sender: "user",
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputMessage("");
    setIsTyping(true);

    // Smart Bot response processing
    setTimeout(() => {
      const lower = text.toLowerCase();
      let reply = "";
      let actionLink: { label: string; href: string } | undefined;

      // Cocokkan kode resi: 4 angka (format lama) atau 8 karakter base32.
      const ticketMatch = text.match(/SRV-\d{8}-(?:\d{4}|[0-9A-HJKMNP-TV-Z]{8})/i);
      if (ticketMatch) {
        const ticketCode = ticketMatch[0].toUpperCase();
        const ticket = serviceTickets.find((t) => t.ticket_code.toUpperCase() === ticketCode);
        if (ticket) {
          reply = `Ditemukan tiket [${ticket.ticket_code}] untuk unit ${ticket.device_model}. Status saat ini: ${ticket.repair_status.toUpperCase()}. Total biaya perbaikan: ${formatIDR(
            ticket.total_fee
          )}.`;
          actionLink = {
            label: "Buka Detail Pelacakan Linimasa",
            href: `/id/tracking?ticket=${ticket.ticket_code}`,
          };
        } else {
          reply = `Maaf, kode tiket ${ticketCode} tidak ditemukan di database Meja Servis At Cell. Mohon periksa kembali nomor tiket pada nota penerimaan Anda.`;
        }
      } else if (lower.includes("servis") || lower.includes("service") || lower.includes("rusak") || lower.includes("ganti")) {
        reply = `Untuk layanan servis, kami menyediakan garansi pengerjaan resmi hingga 90 hari dengan suku cadang original. Anda juga bisa melacak progres reparasi secara real-time.`;
        actionLink = {
          label: "Halaman Cek Status Servis",
          href: "/id/tracking",
        };
      } else if (lower.includes("stok") || lower.includes("ready") || lower.includes("iphone") || lower.includes("samsung") || lower.includes("beli")) {
        const availableCount = inventoryUnits.filter((u) => u.status === "available").length;
        reply = `Saat ini tersedia ${availableCount} unit fisik smartphone bergaransi resmi toko yang siap Anda bawa pulang dengan verifikasi IMEI 15-digit.`;
        actionLink = {
          label: "Buka Etalase Ready Stock",
          href: "/id/catalog",
        };
      } else if (lower.includes("tukar") || lower.includes("trade") || lower.includes("second") || lower.includes("bekas")) {
        reply = `Program Trade-In At Cell menerima tukar tambah dengan penilaian objektif berdasarkan grading fisik (layar, bodi, kamera, baterai). Taksiran harga langsung memotong pembayaran unit baru!`;
        actionLink = {
          label: "Simulasi Taksiran Trade-In",
          href: "/id/trade-in",
        };
      } else if (lower.includes("jam") || lower.includes("buka") || lower.includes("alamat") || lower.includes("lokasi")) {
        reply = `Toko kami berlokasi di ${storeSettings.address}. Jam buka: Senin-Jumat (${storeSettings.opening_hours.monday_friday}), Sabtu-Minggu (${storeSettings.opening_hours.saturday_sunday}).`;
      } else {
        reply = `Terima kasih telah menghubungi At Cell! Tim Sales & Teknisi kami siap membantu Anda. Untuk respon instan atau konsultasi langsung dengan staf toko, silakan gunakan tombol WhatsApp Business di tab samping.`;
      }

      const botMsg: ChatMessage = {
        id: `m-bot-${Date.now()}`,
        sender: "bot",
        text: reply,
        timestamp: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
        actionLink,
      };

      setMessages((prev) => [...prev, botMsg]);
      setIsTyping(false);
    }, 700);
  };

  const whatsappTemplates = [
    {
      title: "📦 Tanya Stok Smartphone",
      msg: "Halo At Cell, saya ingin menanyakan ketersediaan stok smartphone ready hari ini.",
    },
    {
      title: "🛠️ Konsultasi Reparasi Servis",
      msg: "Halo Teknisi At Cell, saya mau konsultasi perbaikan handphone saya yang sedang mengalami kendala.",
    },
    {
      title: "🔄 Pengajuan Tukar Tambah",
      msg: "Halo At Cell, saya ingin mengajukan trade-in smartphone lama saya dengan unit ready di toko.",
    },
    {
      title: "🧾 Cek Tiket Servis",
      msg: "Halo At Cell, saya ingin konfirmasi status pengerjaan tiket servis unit saya.",
    },
  ];

  const cleanWaNumber = (storeSettings.whatsapp_number || "6285775398389").replace(/\D/g, "");

  return (
    <div
      data-hide-on-login
      className="fixed bottom-5 right-5 z-50 flex flex-col items-end print:hidden"
    >
      {/* Expanded Chat Box */}
      {isOpen && (
        <div className="mb-3 w-[360px] sm:w-[390px] h-[520px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-200">
          {/* Header */}
          <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-accent text-white flex items-center justify-center font-bold text-base shadow-md">
                  AT
                </div>
                <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 border-2 border-slate-900" />
              </div>
              <div>
                <div className="font-bold text-sm text-white flex items-center gap-1.5">
                  <span>At Cell Customer Care</span>
                  <Badge variant="success" className="text-[9px] py-0 px-1 font-mono">
                    ONLINE
                  </Badge>
                </div>
                <div className="text-[11px] text-slate-400">
                  Live Chat & WhatsApp Business Resmi
                </div>
              </div>
            </div>

            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="grid grid-cols-2 border-b border-slate-200 bg-slate-50 text-xs font-bold">
            <button
              onClick={() => setActiveTab("livechat")}
              className={`py-2.5 flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                activeTab === "livechat"
                  ? "border-accent text-slate-900 bg-white"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Live Chat At Cell</span>
            </button>
            <button
              onClick={() => setActiveTab("whatsapp")}
              className={`py-2.5 flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                activeTab === "whatsapp"
                  ? "border-emerald-600 text-emerald-700 bg-white"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              <span>WhatsApp Business</span>
            </button>
          </div>

          {/* TAB 1: LIVE CHAT */}
          {activeTab === "livechat" && (
            <div className="flex-1 flex flex-col justify-between overflow-hidden bg-slate-50/50">
              {/* Messages Area */}
              <div className="flex-1 p-3.5 space-y-3 overflow-y-auto">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${
                      msg.sender === "user" ? "items-end" : "items-start"
                    }`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed shadow-xs ${
                        msg.sender === "user"
                          ? "bg-accent text-white rounded-br-none"
                          : "bg-white text-slate-800 border border-slate-200 rounded-bl-none"
                      }`}
                    >
                      {msg.text}

                      {msg.actionLink && (
                        <div className="mt-2.5 pt-2 border-t border-white/25">
                          <a
                            href={msg.actionLink.href}
                            className="inline-flex items-center gap-1 font-bold text-white hover:underline text-[11px]"
                          >
                            <span>{msg.actionLink.label}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 px-1">
                      {msg.timestamp}
                    </span>
                  </div>
                ))}

                {isTyping && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-white p-2.5 rounded-xl border border-slate-200 w-fit">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" />
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce [animation-delay:0.2s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce [animation-delay:0.4s]" />
                    <span className="text-[11px] font-medium ml-1">At Cell sedang mengetik...</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Prompt Chips */}
              <div className="p-2 border-t border-slate-200 bg-white flex gap-1.5 overflow-x-auto text-[11px]">
                <button
                  type="button"
                  onClick={() => handleSendMessage("Cek status servis tiket SRV-20260912-7K4M2QX9")}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full shrink-0 transition-colors cursor-pointer"
                >
                  🔍 Cek Tiket Servis
                </button>
                <button
                  type="button"
                  onClick={() => handleSendMessage("Apakah ada stok iPhone ready?")}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full shrink-0 transition-colors cursor-pointer"
                >
                  📱 Cek Stok iPhone
                </button>
                <button
                  type="button"
                  onClick={() => handleSendMessage("Bagaimana cara tukar tambah smartphone lama?")}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full shrink-0 transition-colors cursor-pointer"
                >
                  🔄 Cara Tukar Tambah
                </button>
              </div>

              {/* Input Form */}
              <div className="p-2.5 border-t border-slate-200 bg-white">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="flex items-center gap-1.5"
                >
                  <Input
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder="Ketik pesan atau masukkan nomor tiket..."
                    className="h-9 text-xs"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    className="h-9 w-9 p-0 shrink-0 bg-accent hover:bg-accent-deep"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 2: WHATSAPP BUSINESS */}
          {activeTab === "whatsapp" && (
            <div className="flex-1 p-4 overflow-y-auto bg-emerald-50/30 space-y-4 text-xs">
              <div className="p-4 bg-white rounded-xl border border-emerald-200 shadow-xs space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">
                    WA
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">Official WhatsApp Business</h4>
                    <div className="text-[11px] text-emerald-700 font-mono font-semibold">
                      +{cleanWaNumber} (At Cell Admin)
                    </div>
                  </div>
                </div>
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  Hubungi tim staf operasional kami secara langsung di WhatsApp untuk negosiasi trade-in, booking jadwal servis prioritas, atau pemesanan unit baru.
                </p>
              </div>

              <div className="space-y-2">
                <span className="font-bold text-slate-700 block text-xs">
                  Pilih Topik Chat Cepat:
                </span>
                {whatsappTemplates.map((t, i) => (
                  <a
                    key={i}
                    href={`https://wa.me/${cleanWaNumber}?text=${encodeURIComponent(t.msg)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block p-3 bg-white rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/50 transition-all group"
                  >
                    <div className="font-bold text-slate-900 group-hover:text-emerald-700 flex items-center justify-between">
                      <span>{t.title}</span>
                      <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-emerald-600" />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 italic line-clamp-1">
                      &ldquo;{t.msg}&rdquo;
                    </p>
                  </a>
                ))}
              </div>

              <a
                href={`https://wa.me/${cleanWaNumber}`}
                target="_blank"
                rel="noreferrer"
                className="block pt-2"
              >
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-5 gap-2 shadow-md shadow-emerald-600/20">
                  <MessageCircle className="w-4 h-4" />
                  <span>Buka Chat WhatsApp Kosong</span>
                </Button>
              </a>
            </div>
          )}
        </div>
      )}

      {/* Floating Trigger Button */}
      <button
        onClick={() => {
          setIsOpen((open) => !open);
          if (!isOpen) setUnreadCount(0);
        }}
        className="flex items-center gap-2.5 px-4 py-3 bg-accent hover:bg-accent-deep text-white rounded-full shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer font-bold text-xs ring-4 ring-accent/20"
      >
        <div className="relative">
          <MessageCircle className="w-5 h-5" />
          {unreadCount > 0 && !isOpen && (
            <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-amber-400 text-slate-950 rounded-full text-[9px] font-black flex items-center justify-center">
              1
            </span>
          )}
        </div>
        <span className="hidden sm:inline">
          {isOpen ? "Tutup Bantuan" : "Chat CS & WhatsApp"}
        </span>
      </button>
    </div>
  );
}
