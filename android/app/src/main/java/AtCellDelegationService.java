package my.id.atcell;

import com.google.androidbrowserhelper.trusted.DelegationService;

/**
 * DelegationService milik TWA.
 *
 * Didaftarkan di AndroidManifest.xml dengan android:enabled bernilai false
 * lewat resValue enableNotification, jadi kelas ini tidak pernah
 * diinstantiate. Service itu hanya berguna bila situs memakai Notification
 * Triggers API, yang belum dipakai At Cell; menyalakannya tanpa fungsi
 * hanya menambah service berjalan sia-sia.
 *
 * Namanya memakai awalan AtCell supaya tidak bentrok dengan kelas library
 * yang nama einfach-nya sama. Lihat catatan di AtCellLauncherActivity.
 */
public class AtCellDelegationService extends DelegationService {
}
