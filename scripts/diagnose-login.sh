#!/usr/bin/env bash
set -euo pipefail

: "${AKOD_LOGIN_URL:?AKOD_LOGIN_URL saknas}"
: "${AKOD_USERNAME:?AKOD_USERNAME saknas}"
: "${AKOD_PASSWORD:?AKOD_PASSWORD saknas}"

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

cookie_jar="$workdir/cookies.txt"
login_html="$workdir/login.html"
login_form="$workdir/login-form.txt"
login_post_html="$workdir/login-post.html"
service_html="$workdir/service.html"

read -r service_url origin < <(
  python3 - "$AKOD_LOGIN_URL" <<'PY'
import sys
from urllib.parse import urljoin, urlsplit

login = sys.argv[1]
parts = urlsplit(login)
origin = f"{parts.scheme}://{parts.netloc}"
print(urljoin(login, "/ServiceBooking.aspx"), origin)
PY
)

echo "=== curl login diagnostic ==="

curl -sS -L \
  --connect-timeout 10 \
  --max-time 30 \
  -A "Mozilla/5.0" \
  -c "$cookie_jar" \
  -b "$cookie_jar" \
  -o "$login_html" \
  -w 'diag_login_get_http=%{http_code}\n' \
  "$AKOD_LOGIN_URL"

LOGIN_HTML="$login_html" LOGIN_FORM="$login_form" python3 <<'PY'
import os
from html.parser import HTMLParser
from urllib.parse import urlencode

class Inputs(HTMLParser):
    def __init__(self):
        super().__init__()
        self.values = {}

    def handle_starttag(self, tag, attrs):
        if tag.lower() != "input":
            return
        data = dict(attrs)
        name = data.get("name")
        if name:
            self.values[name] = data.get("value", "")

html = open(os.environ["LOGIN_HTML"], encoding="utf-8", errors="replace").read()
parser = Inputs()
parser.feed(html)

viewstate = parser.values.get("__VIEWSTATE", "")
eventvalidation = parser.values.get("__EVENTVALIDATION", "")

print(f"diag_login_get_has_form={'true' if 'MainContent_txtUserName' in html else 'false'}")
print(f"diag_login_get_viewstate_len={len(viewstate)}")
print(f"diag_login_get_eventvalidation_len={len(eventvalidation)}")

if not viewstate or not eventvalidation:
    raise SystemExit("Login-sidan saknar VIEWSTATE/EVENTVALIDATION")

payload = {
    "__EVENTTARGET": "",
    "__EVENTARGUMENT": "",
    "__VIEWSTATE": viewstate,
    "__VIEWSTATEGENERATOR": parser.values.get("__VIEWSTATEGENERATOR", ""),
    "__VIEWSTATEENCRYPTED": parser.values.get("__VIEWSTATEENCRYPTED", ""),
    "__EVENTVALIDATION": eventvalidation,
    "ctl00$MainContent$txtUserName": os.environ["AKOD_USERNAME"],
    "ctl00$MainContent$txtPassword": os.environ["AKOD_PASSWORD"],
    "ctl00$MainContent$btnLogin": "Login",
}

with open(os.environ["LOGIN_FORM"], "w", encoding="utf-8") as fh:
    fh.write(urlencode(payload))
PY

curl -sS -L \
  --connect-timeout 10 \
  --max-time 30 \
  -A "Mozilla/5.0" \
  -c "$cookie_jar" \
  -b "$cookie_jar" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "Origin: $origin" \
  -H "Referer: $AKOD_LOGIN_URL" \
  --data-binary "@$login_form" \
  -o "$login_post_html" \
  -w 'diag_login_post_http=%{http_code}\n' \
  "$AKOD_LOGIN_URL"

curl -sS -L \
  --connect-timeout 10 \
  --max-time 30 \
  -A "Mozilla/5.0" \
  -c "$cookie_jar" \
  -b "$cookie_jar" \
  -o "$service_html" \
  -w 'diag_service_get_http=%{http_code}\n' \
  "$service_url"

LOGIN_POST_HTML="$login_post_html" SERVICE_HTML="$service_html" COOKIE_JAR="$cookie_jar" python3 <<'PY'
import os

post_html = open(os.environ["LOGIN_POST_HTML"], encoding="utf-8", errors="replace").read()
service_html = open(os.environ["SERVICE_HTML"], encoding="utf-8", errors="replace").read()

print(f"diag_login_post_has_login_form={'true' if 'MainContent_txtUserName' in post_html else 'false'}")
print(f"diag_login_post_has_welcome={'true' if 'Welcome' in post_html else 'false'}")
print(f"diag_service_has_login_form={'true' if 'MainContent_txtUserName' in service_html else 'false'}")
print(f"diag_service_has_unit_input={'true' if 'MainContent_txtUnitID' in service_html else 'false'}")
print(f"diag_service_has_release_input={'true' if 'MainContent_txtReleaseNo' in service_html else 'false'}")
print(f"diag_service_has_logout={'true' if 'Logout' in service_html else 'false'}")
print(f"diag_service_has_welcome={'true' if 'Welcome' in service_html else 'false'}")

names = []
try:
    for raw in open(os.environ["COOKIE_JAR"], encoding="utf-8", errors="replace"):
        line = raw.rstrip("\n")
        if not line or (line.startswith("#") and not line.startswith("#HttpOnly_")):
            continue
        parts = line.split("\t")
        if len(parts) >= 7:
            names.append(parts[5])
except FileNotFoundError:
    pass

print("diag_cookie_names=" + ",".join(sorted(set(names))))
print("diag_curl_login_result=" + ("success" if 'MainContent_txtUnitID' in service_html and 'MainContent_txtUserName' not in service_html else "failure"))
PY
