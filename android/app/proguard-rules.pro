# Aturan R8 untuk Trusted Web Activity.
#
# browser-helper membaca beberapa kelas secara refleksi saat runtime
# (misalnya dipakai untuk membawa metadata TWA ke Browser). Tanpa aturan di
# bawah, minify pada build release akan menghapus atau mengganti nama kelas
# itu dan app rusak tepat saat dibuka, bukan saat build.
-keep class com.google.androidbrowserhelper.** { *; }
-keep class androidx.browser.customtabs.** { *; }
-keepattributes *Annotation*

# TWA memuat Activity dari metadata XML, jadi nama Activity harus tetap.
-keep class my.id.atcell.AtCellLauncherActivity { *; }
-keep class my.id.atcell.AtCellDelegationService { *; }
