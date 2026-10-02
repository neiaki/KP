# Akses Panel Coolify

Panel Coolify adalah kendali penuh atas host production: environment aplikasi,
trigger deploy, log, terminal container, DNS, dan resource. Dokumen ini
menjelaskan jalur akses menjelaskan kenapa panel harus tertutup. Dokumen ini
menjelaskan cara tetap masuk setelah tertutup.

Dokumen ini melengkapi `VPS-HARDENING.md` yang `VPS-HARDENING.md` menjelaskan kenapa panel harus
tertutup. Dokumen ini menjelaskan cara tetap|abbr masuk setelah tertutup.

## Ringkas

| Jalur | Perlu apa | Pakai kapan |
|---|---|---|
| SSH tunnel | Kredensial SSH saja | Harian. Tidak butuh perubahan firewall sama sekali. |
| Pengecualian port 8000 | IP publik owner | Kalau butuh bookmark URL biasa, misalnya dari HP. |

## 1. SSH tunnel (jalur utama)

Cara paling aman, dan tidak mengubah apa pun di host:

```bash
ssh -L 8000:127.0.0.1:8000 vpsubuntu
```

Lalu buka `http://127.0.0.1:8000/login` di browser laptop. Tunnel ini
meneruskan lewat SSH, jadi tidak pernah menyentuh port publik sama sekali.

Jalur ini sengaja **tidak** ikut ditutup oleh penjaga Docker. Berkas
`/usr/local/sbin/docker-dnat-guard.sh` hanya governs trafik `-i eth0`, yaitu
ingress dari internet, sehingga trafik loopback dari tunnel lolos.

Tunnel bisa ditutup dengan menekan `Ctrl+C` di terminalnya.

## 2. Pengecualian port 8000 untuk IP owner

Kalau lebih nyaman memakai `http://<IP>:8000/` langsung, ada pengecualian
di penjaga Docker, hanya untuk satu IP:

```
-A DOCKER-USER -s <IP-publik>/32 -i eth0 -p tcp \
   -m conntrack --ctorigdstport 8000 \
   -m comment --comment atcell-panel-exception -j RETURN
```

Rule ini ada **sebelum** aturan penolakan, jadi panel terbuka hanya untuk IP
itu. Port `8080`, `6001`, dan `6002` tetap tertutup untuk semua orang.

### Kenapa harus pakai `--ctorigdstport`

Port host `8000` dipublish ke port container `8080`. Docker melakukan DNAT di
`nat/PREROUTING`, dan rantai `DOCKER-USER` berjalan **sesudah** itu. Jadi pada
saat rule dijalankan, port paket sudah terbaca `8080`, sama persis dengan
trafik yang justru harus diblokir.

Kalau rule ini pencocokannya memakai port saat ini, dia tidak bisa membedakan
"permintaan ke panel lewat 8000" dari "serangan langsung ke 8080", dan salah
satu dari keduanya akan keliru. `--ctorigdstport` membaca port sebelum DNAT,
jadi keduanya jadi bisa dibedakan.

Aturan `ufw` tidak bisa dipakai untuk keperluan ini. Paket untuk published port
Docker dibelokkan dan diteruskan, bukan diserahkan secara lokal, jadi paketnya
tidak pernah sampai ke rantai `INPUT` tempat `ufw` bekerja. Aturan `ufw` pada
port `8000` terlihat benar di `ufw status` tapi tidak berefek apa pun.

### Mengubah IP owner

Kalau IP publik berubah, edit `ADMIN_IP` di
`/usr/local/sbin/docker-dnat-guard.sh`, lalu jalankan:

```bash
sudo /usr/local/sbin/docker-dnat-guard.sh
```

Skripnya idempoten, jadi aman dijalankan berkali-kali.

## Kalau panel tidak bisa diakses

Lakukan berurutan dari yang paling murah:

| Gejala | Artinya | Langkah |
|---|---|---|
| `curl` timeout ke port 8000 dari luar | Pengecualian tidak cocok dengan IP sekarang | Cek IP dengan `curl https://api.ipify.org`, bandingkan dengan `ADMIN_IP` |
| Timeout juga dari dalam VPS lewat IP publik | Publikasi IP tidak hairpin, normal | Uji dari luar, bukan dari VPS |
| Timeout dari mana pun | Aturan hilang setelah reboot | Jalankan ulang `sudo /usr/local/sbin/docker-dnat-guard.sh`, cek `systemctl status docker-dnat-guard.service` |
| 403 atau logout terus-menerus | Sesi login kedaluwarsa | Login ulang di `/login` |

## Batas yang disengaja

Panel ini **tidak** memakai TLS. Kalau dibuka lewat port 8000, password dan
cookie sesi melintas tanpa enkripsi. Membuka akses juga berarti satu login
memberi akses ke seluruh deployment, environment production, dan kunci
Supabase.

Kalau someday butuh URL yang benar-benar permanen, jalurnya bukan membuka
port, melainkan memberi hostname dengan TLS lewat `coolify-proxy` (Traefik)
yang sudah berjalan di host ini. Itu perubahan yang lebih besar dan perlu
dibahas terpisah.