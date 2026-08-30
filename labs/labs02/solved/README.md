<details>
<summary>Hint 1 — Pemetaan surface</summary>

Baca semua informasi yang ditampilkan dashboard. Lihat API Reference. Identifikasi endpoint tujuan dan scope apa yang dibutuhkan.

</details>

<details>
<summary>Hint 2 — Dari mana scope berasal?</summary>

Akun user-mu hanya memiliki satu scope. Endpoint flag membutuhkan scope yang berbeda. Service account memiliki scope berbeda — dan platform menyebutkan bahwa kredensialnya dirotasi.

</details>

<details>
<summary>Hint 3 — Live feed</summary>

Platform mengekspos endpoint WebSocket. Salah satunya adalah price ticker. Yang lain adalah feed internal dengan beberapa channel. Tidak semua channel diiklankan saat connect.

</details>

<details>
<summary>Hint 4 — Pola penamaan channel</summary>

Channel yang diiklankan mengikuti pola `system.<name>`. Changelog menyebutkan adanya audit subsystem. Coba tebak nama channel berdasarkan pola tersebut.

</details>

<details>
<summary>Hint 5 — Full chain</summary>

Connect ke `ws://<host>/ws/system`, subscribe ke `system.audit`, amati event rotasi kredensial yang mengalir, ambil key dengan scope yang tepat, lalu panggil `/api/v1/flag`.

</details>
