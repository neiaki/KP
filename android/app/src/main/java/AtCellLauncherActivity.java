package my.id.atcell;

import android.content.pm.ActivityInfo;
import android.os.Build;
import android.os.Bundle;

import com.google.androidbrowserhelper.trusted.LauncherActivity;

/**
 * Activity yang muncul di layar utama At Cell.
 *
 * Namanya tidak sama dengan LauncherActivity milik library, dan itu
 * disengaja. Kalau kelas lokal memakai nama yang sama persis dengan kelas
 * yang diimpor, javac menolaknya sebagai deklarasi ganda, dan satu-satunya
 * cara mengatasinya harus menghapus import lalu menulis nama lengkap di
 * baris extends. Nama sendiri lebih enak dibaca dan tidak bergantung pada
 * bentuk internal library.
 *
 * Kelas induknya tetap yang membaca metadata TWA dari AndroidManifest.xml:
 * URL awal, warna status bar, strategi fallback, dan handler protokol.
 *
 * Satu-satunya tambahan di sini adalah penguncian orientasi. Nilai portrait
 * diambil dari resValue orientation yang sama dengan manifest web, jadi app
 * dan PWA bertingkah sama.
 */
public class AtCellLauncherActivity extends LauncherActivity {

    private static final int SCREEN_ORIENTATION_PORTRAIT = 1;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Di Android 8.0 ke bawah, mengunci orientasi pada activity dengan
        // latar transparan membuat app crash. Lihat
        // https://github.com/GoogleChromeLabs/bubblewrap/issues/496
        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {
            setRequestedOrientation(SCREEN_ORIENTATION_PORTRAIT);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }
    }
}
