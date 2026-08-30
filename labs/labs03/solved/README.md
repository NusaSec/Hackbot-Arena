<details>
<summary>Hint 1 — orientasi</summary>

Register akun, login, jelajahi dashboard. Lihat request flow di DevTools — bagaimana frontend authentikasi ke API? Apa yang disimpan di mana?
</details>

<details>
<summary>Hint 2 — inspect token</summary>

Setelah login, kamu dapat JWT token (lihat localStorage atau response /api/auth/login). Decode token di [jwt.io](https://jwt.io) atau pakai `base64 -d`. Apa algoritma yang dipakai di header? Apa claims di payload?
</details>

<details>
<summary>Hint 3 — recon protocol</summary>

Server memakai algoritma asimetrik (RS256). Untuk verifikasi, server membutuhkan public key. Di mana public key biasanya di-publish untuk JWT-based API? Ada endpoint discovery standar.
</details>

<details>
<summary>Hint 4 — read the docs</summary>

Buka `/docs/api` di browser. Perhatikan section Authentication — apa yang disebutkan tentang algoritma yang diterima server? Apa "kompatibilitas mobile pre-v1.4" yang dimention?
</details>

<details>
<summary>Hint 5 — the bug class</summary>

Bug class ini bernama "algorithm confusion" atau "JWT alg confusion attack". Ide-nya: jika server menerima HS256 (symmetric) dan RS256 (asymmetric) dari token header, dan keduanya sama-sama dependent pada key material yang sama, attacker yang bisa baca public key bisa forge token. Bagaimana?
</details>

<details>
<summary>Hint 6 — payload</summary>

1. Ambil RSA public key dari `/.well-known/jwks.json`. Format JWK perlu di-convert ke PEM.
2. Buat JWT header `{"alg":"HS256","typ":"JWT"}`
3. Buat payload dengan `sub` user_id admin (lihat seed data, atau brute force kecil) dan `role: "admin"`
4. Sign dengan `HMAC-SHA256(public_key_pem_bytes, header_b64 + "." + payload_b64)`
5. Kirim sebagai `Authorization: Bearer ...`
</details>
