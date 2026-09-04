import json
import os
import re
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse


PORT = int(os.environ.get("PORT", "5000"))
HOST = os.environ.get("HOST", "0.0.0.0")
FLAG = os.environ.get("FLAG", "FLAG{nusasec-ca997f859a82746a9d8d36a80c316bca}")


USERS = {
    "lyra-lane": {
        "id": "usr_talent_1001",
        "handle": "lyra-lane",
        "displayName": "Lyra Lane",
        "role": "talent",
        "listed": True,
        "avatarPath": "/assets/avatars/lyra-lane.jpg",
        "bio": "Acoustic singer creating short birthday and anniversary clips.",
        "category": "Music",
        "rating": 4.94,
        "reviewCount": 318,
        "basePriceCents": 15900,
        "currency": "USD",
        "fanClubId": "fc_backstage_17",
        "orders": [
            {
                "orderId": "ord_91001",
                "purchaserUserId": "usr_fan_2001",
                "purchaserName": "Joe M.",
                "customerName": "Cornelius",
                "recipientEmail": "cornelius@example.test",
                "priceCents": 20715,
                "paymentMethod": "stripePaymentIntent",
                "paymentReference": "pi_synthetic_7c2a0b",
                "status": "fulfilled",
                "createdAt": "2026-06-25T10:14:21Z",
                "deliveryDueAt": "2026-06-27T10:14:21Z",
                "mediaId": "vid_lyra_birthday_01",
                "internalReview": {
                    "queue": "standard",
                    "moderator": "mod_south_02",
                    "riskScore": 8,
                },
            },
            {
                "orderId": "ord_91042",
                "purchaserUserId": "usr_fan_2002",
                "purchaserName": "Filip R.",
                "customerName": "Tabitha",
                "recipientEmail": "tabitha@example.test",
                "priceCents": 10451,
                "paymentMethod": "stripePaymentIntent",
                "paymentReference": "pi_synthetic_8990aa",
                "status": "fulfilled",
                "createdAt": "2026-06-27T19:22:02Z",
                "deliveryDueAt": "2026-06-29T19:22:02Z",
                "mediaId": "vid_lyra_anniversary_02",
                "internalReview": {
                    "queue": "expedited",
                    "moderator": "mod_south_01",
                    "riskScore": 3,
                },
            },
            {
                "orderId": "ord_91077",
                "purchaserUserId": "usr_fan_2003",
                "purchaserName": "Gianni P.",
                "customerName": "Judith",
                "recipientEmail": "judith@example.test",
                "priceCents": 10499,
                "paymentMethod": "appleIAP",
                "paymentReference": "iap_synthetic_37ac11",
                "status": "fulfilled",
                "createdAt": "2026-06-29T08:41:53Z",
                "deliveryDueAt": "2026-07-01T08:41:53Z",
                "mediaId": "vid_lyra_launch_03",
                "internalReview": {
                    "queue": "standard",
                    "moderator": "mod_south_05",
                    "riskScore": 4,
                },
            },
        ],
        "internalPricing": {
            "iosPriceCents": 13571,
            "expeditedIosPriceCents": 15299,
            "creatorPayoutBps": 7450,
            "platformFeeBps": 2550,
        },
        "featureFlags": {
            "twentyFourHourExpiration": False,
            "backgroundUploadingEnabled": True,
            "fanClubPaidPreview": True,
            "rawMediaUrlPassthrough": True,
        },
        "staffNotes": [
            "Public profile cache still uses the legacy serializer.",
            "Do not expose order_media.raw_source_url outside the creator dashboard.",
        ],
    },
    "orion-kade": {
        "id": "usr_talent_1002",
        "handle": "orion-kade",
        "displayName": "Orion Kade",
        "role": "talent",
        "listed": True,
        "avatarPath": "/assets/avatars/orion-kade.jpg",
        "bio": "Fitness coach recording quick technique checks.",
        "category": "Fitness",
        "rating": 4.81,
        "reviewCount": 204,
        "basePriceCents": 8900,
        "currency": "USD",
        "fanClubId": "fc_formcheck_08",
        "orders": [
            {
                "orderId": "ord_92004",
                "purchaserUserId": "usr_fan_2011",
                "purchaserName": "Ayu S.",
                "customerName": "Rama",
                "recipientEmail": "rama@example.test",
                "priceCents": 8900,
                "paymentMethod": "stripePaymentIntent",
                "paymentReference": "pi_synthetic_79ad22",
                "status": "fulfilled",
                "createdAt": "2026-06-22T15:03:18Z",
                "deliveryDueAt": "2026-06-24T15:03:18Z",
                "mediaId": "vid_orion_squat_01",
                "internalReview": {
                    "queue": "standard",
                    "moderator": "mod_fitness_01",
                    "riskScore": 2,
                },
            }
        ],
        "internalPricing": {
            "iosPriceCents": 7599,
            "expeditedIosPriceCents": 9299,
            "creatorPayoutBps": 7000,
            "platformFeeBps": 3000,
        },
        "featureFlags": {
            "twentyFourHourExpiration": True,
            "backgroundUploadingEnabled": True,
            "fanClubPaidPreview": False,
            "rawMediaUrlPassthrough": False,
        },
        "staffNotes": ["Migrated to the fixed serializer in staging only."],
    },
    "qa-archive": {
        "id": "usr_31337",
        "handle": "qa-archive",
        "displayName": "QA Archive",
        "role": "internal",
        "listed": False,
        "avatarPath": "/assets/avatars/default.jpg",
        "bio": "Internal validation account. This profile should never be public.",
        "category": "Internal",
        "rating": 0,
        "reviewCount": 0,
        "basePriceCents": 0,
        "currency": "USD",
        "fanClubId": None,
        "orders": [
            {
                "orderId": "ord_hidden_31337",
                "purchaserUserId": "usr_audit_9001",
                "purchaserName": "Security Retest",
                "customerName": "Internal QA",
                "recipientEmail": "qa-private@example.test",
                "priceCents": 0,
                "paymentMethod": "compedManual",
                "paymentReference": "manual_retest_ticket_404",
                "status": "ready_for_retest",
                "createdAt": "2026-07-01T11:04:00Z",
                "deliveryDueAt": "2026-07-01T12:00:00Z",
                "mediaId": "vid_flag_master",
                "internalReview": {
                    "queue": "security-retest",
                    "moderator": "mod_security_01",
                    "riskScore": 99,
                    "note": "Proof is stored only in the raw processed media object.",
                },
            }
        ],
        "internalPricing": {
            "iosPriceCents": 0,
            "expeditedIosPriceCents": 0,
            "creatorPayoutBps": 0,
            "platformFeeBps": 0,
        },
        "featureFlags": {
            "twentyFourHourExpiration": False,
            "backgroundUploadingEnabled": True,
            "fanClubPaidPreview": True,
            "rawMediaUrlPassthrough": True,
        },
        "staffNotes": [
            "Hidden from search, but the legacy show endpoint still accepts the id.",
            "The CDN validator trusts signed-looking cache parameters only.",
        ],
    },
}


FANCLUBS = {
    "fc_backstage_17": {
        "id": "fc_backstage_17",
        "name": "Lyra Backstage",
        "talentHandle": "lyra-lane",
        "monthlyPriceCents": 499,
        "publicPreview": [
            {
                "messageId": "msg_public_1",
                "authorName": "Lyra Lane",
                "text": "New acoustic set preview drops this week.",
            }
        ],
        "paidMessages": [
            {
                "messageId": "msg_paid_5001",
                "authorUserId": "usr_fan_2001",
                "authorName": "Joe M.",
                "text": "Thanks for the birthday clip. The unwatermarked copy loaded instantly.",
                "createdAt": "2026-06-27T12:02:18Z",
                "attachmentMediaId": "vid_lyra_birthday_01",
            },
            {
                "messageId": "msg_paid_71337",
                "authorUserId": "usr_31337",
                "authorName": "QA Archive",
                "text": "Retest account linked here while validating raw media passthrough.",
                "createdAt": "2026-07-01T11:09:42Z",
                "attachmentMediaId": "vid_flag_master",
            },
        ],
        "subscriberUserIds": [
            "usr_fan_2001",
            "usr_fan_2002",
            "usr_fan_2003",
            "usr_31337",
        ],
        "subscriberPayments": [
            {
                "userId": "usr_fan_2001",
                "displayName": "Joe M.",
                "paymentMethod": "stripePaymentIntent",
                "last4": "4242",
                "amountCents": 499,
            },
            {
                "userId": "usr_31337",
                "displayName": "QA Archive",
                "paymentMethod": "internalComp",
                "last4": None,
                "amountCents": 0,
            },
        ],
        "moderationQueue": {
            "activeTicket": "SEC-404",
            "linkedUserId": "usr_31337",
            "message": "Fanclub preview is returning paid content to anonymous clients.",
        },
    },
    "fc_formcheck_08": {
        "id": "fc_formcheck_08",
        "name": "Orion Form Check",
        "talentHandle": "orion-kade",
        "monthlyPriceCents": 299,
        "publicPreview": [
            {
                "messageId": "msg_public_2",
                "authorName": "Orion Kade",
                "text": "Mobility warmup notes are available for members.",
            }
        ],
        "paidMessages": [],
        "subscriberUserIds": ["usr_fan_2011", "usr_fan_2012"],
        "subscriberPayments": [],
        "moderationQueue": {},
    },
}


MEDIA_LIBRARY = {
    "vid_lyra_birthday_01": {
        "ownerUserId": "usr_talent_1001",
        "filename": "lyra-birthday-processed.mp4",
        "durationSeconds": 34,
        "body": "FAKE_MP4\nclip=lyra-birthday\nwatermark=disabled\n",
    },
    "vid_lyra_anniversary_02": {
        "ownerUserId": "usr_talent_1001",
        "filename": "lyra-anniversary-processed.mp4",
        "durationSeconds": 28,
        "body": "FAKE_MP4\nclip=lyra-anniversary\nwatermark=disabled\n",
    },
    "vid_lyra_launch_03": {
        "ownerUserId": "usr_talent_1001",
        "filename": "lyra-launch-processed.mp4",
        "durationSeconds": 41,
        "body": "FAKE_MP4\nclip=lyra-launch\nwatermark=disabled\n",
    },
    "vid_orion_squat_01": {
        "ownerUserId": "usr_talent_1002",
        "filename": "orion-squat-check-processed.mp4",
        "durationSeconds": 52,
        "body": "FAKE_MP4\nclip=orion-squat-check\nwatermark=disabled\n",
    },
    "vid_flag_master": {
        "ownerUserId": "usr_31337",
        "filename": "security-retest-master-processed.mp4",
        "durationSeconds": 13,
        "body": (
            "FAKE_MP4\n"
            "clip=security-retest-master\n"
            "watermark=disabled\n"
            f"proof={FLAG}\n"
        ),
    },
}


def json_bytes(body):
    return json.dumps(body, indent=2).encode()


def money(cents):
    return round(cents / 100, 2)


def now_http_date():
    return time.strftime("%a, %d %b %Y %H:%M:%S GMT", time.gmtime())


def clean_identifier(value):
    return unquote(str(value or "")).strip().lower()


def find_user(identifier):
    needle = clean_identifier(identifier)
    for user in USERS.values():
        if needle in (user["id"].lower(), user["handle"].lower()):
            return user
    return None


def public_profile(user, base_url):
    return {
        "id": user["id"],
        "handle": user["handle"],
        "displayName": user["displayName"],
        "avatarUrl": base_url + user["avatarPath"],
        "bio": user["bio"],
        "category": user["category"],
        "rating": user["rating"],
        "reviewCount": user["reviewCount"],
        "basePriceCents": user["basePriceCents"],
        "basePrice": money(user["basePriceCents"]),
        "currency": user["currency"],
        "fanClubId": user["fanClubId"],
        "listed": user["listed"],
    }


def media_urls(base_url, media_id):
    return {
        "mediaId": media_id,
        "watermarkedMediaUrl": (
            f"{base_url}/cdn/media/{media_id}-watermarked.mp4?variant=public"
        ),
        "nakedMediaUrl": (
            f"{base_url}/cdn/media/{media_id}-processed.mp4"
            "?variant=naked&signature=legacy-cache"
        ),
        "nakedThumbnailUrl": (
            f"{base_url}/cdn/thumb/{media_id}.jpg?variant=naked&signature=legacy-cache"
        ),
        "hlsMediaUrl": (
            f"{base_url}/cdn/hls/{media_id}/master.m3u8"
            "?variant=naked&signature=legacy-cache"
        ),
    }


def order_payload(order, base_url):
    leaked = dict(order)
    leaked["price"] = money(order["priceCents"])
    leaked.update(media_urls(base_url, order["mediaId"]))
    return leaked


def talent_list(base_url):
    rows = []
    for user in USERS.values():
        if user["role"] == "talent" and user["listed"]:
            rows.append(public_profile(user, base_url))
    return rows


def fanclub_public(club):
    return {
        "id": club["id"],
        "name": club["name"],
        "talentHandle": club["talentHandle"],
        "monthlyPriceCents": club["monthlyPriceCents"],
        "publicPreview": club["publicPreview"],
    }


def media_id_from_path(path):
    patterns = (
        r"^/cdn/media/(?P<id>.+?)-(?:processed|watermarked)\.mp4$",
        r"^/cdn/thumb/(?P<id>.+?)\.jpg$",
        r"^/cdn/hls/(?P<id>.+?)/master\.m3u8$",
    )
    for pattern in patterns:
        match = re.match(pattern, path)
        if match:
            return match.group("id")
    return None


class ChallengeAPI(BaseHTTPRequestHandler):
    server_version = "TalentHubProfileLeakCTF/1.0"

    def log_message(self, fmt, *args):
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))

    def _base_url(self):
        scheme = self.headers.get("X-Forwarded-Proto", "http").split(",")[0].strip()
        host = self.headers.get("Host") or f"127.0.0.1:{PORT}"
        return f"{scheme or 'http'}://{host}"

    def _send(self, status, body, content_type="application/json", extra_headers=None, head=False):
        raw = body if isinstance(body, bytes) else body.encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "authorization, content-type")
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        self.send_header("Cache-Control", "public, max-age=300")
        if extra_headers:
            for name, value in extra_headers.items():
                self.send_header(name, value)
        self.end_headers()
        if not head:
            self.wfile.write(raw)

    def _json(self, status, body, head=False):
        self._send(status, json_bytes(body), "application/json", head=head)

    def do_OPTIONS(self):
        self._json(204, {})

    def do_HEAD(self):
        self._route(head=True)

    def do_GET(self):
        self._route(head=False)

    def _route(self, head=False):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        query = parse_qs(parsed.query)

        if path == "/":
            self._send(200, self._landing_page(), "text/html; charset=utf-8", head=head)
            return
        if path == "/api/status":
            self._json(
                200,
                {
                    "data": {
                        "status": "ok",
                        "service": "TalentHub",
                        "mode": "ctf",
                    },
                    "error_list": [],
                },
                head=head,
            )
            return
        if path == "/api/talents":
            self._json(200, {"data": talent_list(self._base_url()), "error_list": []}, head=head)
            return
        if path.startswith("/api/user/show/"):
            self._show_user(path[len("/api/user/show/") :], head=head)
            return
        if path.startswith("/api/fanclub/preview/"):
            self._fanclub_preview(path[len("/api/fanclub/preview/") :], head=head)
            return
        if path.startswith("/cdn/"):
            self._serve_cdn(path, query, head=head)
            return

        self._json(
            404,
            {"data": None, "error_list": [{"code": "not_found", "message": "Unknown route"}]},
            head=head,
        )

    def _show_user(self, identifier, head=False):
        user = find_user(identifier)
        if user is None:
            self._json(
                404,
                {
                    "data": None,
                    "error_list": [
                        {"code": "user_not_found", "message": "No matching public profile"}
                    ],
                },
                head=head,
            )
            return

        base_url = self._base_url()
        orders = [order_payload(order, base_url) for order in user["orders"]]

        # Intentional CTF bug: this public serializer returns creator dashboard
        # fields, internal metadata, order ledgers, and raw media URLs.
        self._json(
            200,
            {
                "data": {
                    "profile": public_profile(user, base_url),
                    "orders": orders,
                    "media": [media_urls(base_url, order["mediaId"]) for order in user["orders"]],
                    "rateLimitState": {
                        "maxRequests": 5,
                        "remaining": 5,
                        "windowSeconds": 60,
                        "key": f"profile:{user['id']}:anonymous",
                    },
                    "internalPricing": user["internalPricing"],
                    "featureFlags": user["featureFlags"],
                    "staffNotes": user["staffNotes"],
                    "serializer": "CreatorDashboardProfileSerializer",
                    "debug": {
                        "expectedForAnonymous": [
                            "profile.displayName",
                            "profile.avatarUrl",
                            "profile.basePriceCents",
                            "profile.rating",
                        ],
                        "actualOrderCount": len(orders),
                    },
                },
                "error_list": [],
            },
            head=head,
        )

    def _fanclub_preview(self, club_id, head=False):
        club = FANCLUBS.get(clean_identifier(club_id))
        if club is None:
            self._json(
                404,
                {
                    "data": None,
                    "error_list": [
                        {"code": "fanclub_not_found", "message": "No matching fanclub"}
                    ],
                },
                head=head,
            )
            return

        # Intentional CTF bug: an anonymous preview endpoint embeds paid
        # messages, subscriber ids, and payment metadata.
        body = fanclub_public(club)
        body.update(
            {
                "paidMessages": club["paidMessages"],
                "subscriberUserIds": club["subscriberUserIds"],
                "subscriberPayments": club["subscriberPayments"],
                "moderationQueue": club["moderationQueue"],
            }
        )
        self._json(200, {"data": body, "error_list": []}, head=head)

    def _serve_cdn(self, path, query, head=False):
        media_id = media_id_from_path(path)
        if media_id is None or media_id not in MEDIA_LIBRARY:
            self._send(
                404,
                "not found\n",
                "text/plain; charset=utf-8",
                {"Last-Modified": now_http_date()},
                head=head,
            )
            return

        media = MEDIA_LIBRARY[media_id]
        variant = (query.get("variant", [""])[0] or "").lower()
        if path.startswith("/cdn/thumb/"):
            raw = f"FAKE_JPEG thumbnail for {media_id}\n".encode()
            content_type = "image/jpeg"
        elif path.startswith("/cdn/hls/"):
            raw = (
                "#EXTM3U\n"
                "#EXT-X-VERSION:3\n"
                f"#EXTINF:{media['durationSeconds']},\n"
                f"../media/{media_id}-processed.mp4?variant=naked&signature=legacy-cache\n"
            ).encode()
            content_type = "application/vnd.apple.mpegurl"
        elif variant == "public" or path.endswith("-watermarked.mp4"):
            raw = (
                f"FAKE_MP4\nclip={media_id}\nwatermark=talenthub-public-preview\n"
            ).encode()
            content_type = "video/mp4"
        else:
            raw = media["body"].encode()
            content_type = "video/mp4"

        self._send(
            200,
            raw,
            content_type,
            {
                "Accept-Ranges": "bytes",
                "X-Storage-Class": "creator-raw-media",
                "Last-Modified": now_http_date(),
            },
            head=head,
        )

    def _landing_page(self):
        return """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>TalentHub</title>
  <style>
    :root { --bg: #f7f8fb; --ink: #202636; --muted: #667085; --line: #d9e1ea; --panel: #fff; --accent: #0f766e; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--ink); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    header { display: flex; justify-content: space-between; align-items: center; padding: 22px clamp(18px, 6vw, 76px); border-bottom: 1px solid var(--line); background: #fff; }
    .brand { font-size: 20px; font-weight: 780; }
    nav { display: flex; gap: 18px; color: var(--muted); font-size: 14px; }
    main { max-width: 1060px; margin: 0 auto; padding: 42px 20px 56px; display: grid; grid-template-columns: minmax(0, 1fr) 330px; gap: 28px; align-items: start; }
    h1 { margin: 0 0 16px; font-size: clamp(34px, 5vw, 58px); line-height: 1.04; letter-spacing: 0; }
    p { color: var(--muted); font-size: 18px; line-height: 1.6; margin: 0 0 18px; max-width: 700px; }
    .panel { border: 1px solid var(--line); border-radius: 8px; background: var(--panel); padding: 18px; display: grid; gap: 12px; }
    .row { display: flex; justify-content: space-between; gap: 16px; border-bottom: 1px solid var(--line); padding-bottom: 12px; font-size: 14px; }
    .row:last-child { border-bottom: 0; padding-bottom: 0; }
    .row span { color: var(--muted); }
    code { background: #edf2f7; border-radius: 6px; padding: 3px 6px; }
    .ok { color: var(--accent); font-weight: 720; }
    @media (max-width: 820px) { header { align-items: flex-start; flex-direction: column; gap: 12px; } main { grid-template-columns: 1fr; } nav { flex-wrap: wrap; } }
  </style>
</head>
<body>
  <header>
    <div class="brand">TalentHub</div>
    <nav><span>Profiles</span><span>Fanclubs</span><span>Creator dashboard</span></nav>
  </header>
  <main>
    <section>
      <h1>Personal video messages from local creators.</h1>
      <p>Public profile pages expose ratings, pricing, and a few preview details. Creator dashboard data is supposed to stay private.</p>
      <p>Browse public talent metadata at <code>/api/talents</code>.</p>
    </section>
    <aside class="panel" aria-label="service routes">
      <div class="row"><strong>API</strong><span class="ok">online</span></div>
      <div class="row"><strong>Profile</strong><span>/api/user/show/lyra-lane</span></div>
      <div class="row"><strong>Fanclub</strong><span>preview enabled</span></div>
      <div class="row"><strong>CDN</strong><span>legacy cache</span></div>
    </aside>
  </main>
</body>
</html>
"""


def main():
    print(f"TalentHub Profile Leak CTF listening on http://{HOST}:{PORT}")
    print("Set FLAG, PORT, or HOST via environment variables if needed.")
    server = ThreadingHTTPServer((HOST, PORT), ChallengeAPI)
    server.serve_forever()


if __name__ == "__main__":
    main()
