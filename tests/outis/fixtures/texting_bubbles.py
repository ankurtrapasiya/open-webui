# Vendored for TH-28 (tests/outis/e2e/theme.spec.ts): Texting Bubbles 1.0.0 by @G30, MIT,
# exactly as installed on the live instance 2026-10-03. The test installs it on the throwaway
# instance to check the Outis overrides against the real plugin CSS.
"""
title: Texting Bubbles
description: Shows a model's reply as separate chat bubbles, one per paragraph, and while the reply streams in, reveals them one at a time after a short typing pause with typing dots. Works on every model, or only the ones listed in its Model IDs valve. Pair it with the Texting Bubbles Filter to make a model write like it is texting. Lists, quotes, headings, tables, math, code blocks and embeds get bubbles too, while a reply with a raw HTML block or a `:::` callout stays a normal reply, and dividers between messages are hidden. Published into /static/loader.js through the shared static-asset registry, so it coexists with Theme Designer Pro and any other plugin using it.
author: @G30
author_url: https://openwebui.com/u/g30
funding_url: https://buymeacoffee.com/iamg30
version: 1.0.0
license: MIT
required_open_webui_version: 0.11.0
"""

import hashlib
import json as _json
import logging
import re
import time

from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

STORE_DIR_NAME = "texting_bubbles"
DISABLED_CHECK_SECONDS = 1.0
STALE_MARKER_SECONDS = 10

log = logging.getLogger(__name__)


# ===========================================================================
# Shared static-asset registry
# --- KEEP BYTE-IDENTICAL IN EVERY PLUGIN THAT USES IT ----------------------
# ---------------------------------------------------------------------------
# app.html loads /static/loader.js and /static/custom.css on every page, and
# loader.js is the only hook running before the SvelteKit bundle hydrates. Two
# URLs, many plugins - so none may own either. Each publishes a fragment into
# one app.state registry and the route composes them PER REQUEST, so load order
# is irrelevant, a late plugin needs no cooperation, and a re-exec'd one
# replaces its own key. Per-process: each container serves what it has loaded.
#
# Fragments are inlined, never <script src> / @import - a second request would
# land after hydration, defeating the point.
#
# Contract:
#   * ASSET_REGISTRY_ATTR, ASSET_ROUTE_ATTR, the entry shape and the paths are
#     the interop surface. Everything else is implementation owned by whichever
#     plugin created the route - a stale copy silently serves everyone, hence
#     ASSET_IMPL_VERSION and byte-identity.
#   * `key` must be a module-level constant. Derive it from a build id or a
#     function id and a re-exec registers a SECOND entry - duplicated output,
#     not just a leaked closure.
#   * `order` breaks ties: lower composes first, so on custom.css it loses the
#     cascade and on loader.js it wraps innermost. Default 0. Use it instead of
#     encoding priority in the key, which would only work if every plugin
#     renamed at once.
#   * Producers run SYNCHRONOUSLY on the event loop, on every request, and
#     BEFORE the ETag is compared - so a 304 costs exactly what a 200 costs.
#     "Cheap" is per-call work, not payload size: memoise anything that
#     parses, formats or regexes and return a prebuilt string. No I/O, no
#     locks, no sleeps. Budget tens of microseconds, not milliseconds.
#   * To withdraw, return "" - there is no unregister. A disabled plugin still
#     gets function.disable_started (it fires before is_active flips), but a
#     DELETED one never sees its own deletion, so disable before deleting or
#     the fragment serves until that process restarts.
#   * Reach is the SPA only. A plugin serving its own HTML page loads neither
#     asset and must inject its own.
# ===========================================================================
LOADER_PATH = "/static/loader.js"
CUSTOM_CSS_PATH = "/static/custom.css"
SHARED_ASSET_TYPES = {
    LOADER_PATH: "application/javascript; charset=utf-8",
    CUSTOM_CSS_PATH: "text/css; charset=utf-8",
}
ASSET_REGISTRY_ATTR = "_owui_static_fragments"  # {path: {key: entry}}
ASSET_ROUTE_ATTR = "_owui_shared_asset"  # set to the path the route serves
ASSET_IMPL_ATTR = "_owui_shared_asset_impl"  # implementation version of the route
# Bump when this block changes behaviour: newer evicts older, so the fleet
# converges on one implementation instead of whichever plugin booted first.
ASSET_IMPL_VERSION = 4

# Producer failures are reported once per (path, key, exception type) - compose
# runs on every page load, so an unconditional warning would be a firehose.
_ASSET_WARNED: set = set()


def asset_fragments(app: Any, path: str) -> dict:
    registry = getattr(app.state, ASSET_REGISTRY_ATTR, None)
    if not isinstance(registry, dict):
        registry = {}
        app.state.__setattr__(ASSET_REGISTRY_ATTR, registry)
    bucket = registry.get(path)
    if not isinstance(bucket, dict):
        bucket = {}
        registry[path] = bucket
    return bucket


def asset_sort_key(item):
    """(order, key). Coerced defensively: a non-int order from a third-party
    plugin would raise inside sorted(), outside the per-fragment guard, and
    take down the whole asset."""
    key, entry = item
    try:
        order = int(entry.get("order", 0))
    except (TypeError, ValueError):
        order = 0
    return (order, key)


def asset_strip_block(content: str, start_marker: str, end_marker: str) -> str:
    """Remove every marker-wrapped block, leaving other content untouched."""
    while start_marker in content:
        start = content.find(start_marker)
        end = content.find(end_marker, start)
        if end == -1:
            # No end marker: the block was appended last, so drop to EOF.
            content = content[:start]
            break
        end += len(end_marker)
        if content[end : end + 1] == "\n":
            end += 1
        content = content[:start] + content[end:]
    return content


def asset_compose(app: Any, path: str) -> str:
    """Disk file plus every registered fragment, in (order, key) order."""
    import logging

    try:
        from open_webui.env import STATIC_DIR

        target = Path(STATIC_DIR) / path.rsplit("/", 1)[-1]
        body = (
            ""
            if (target.is_symlink() or not target.is_file())
            else target.read_text(encoding="utf-8")
        )
    except Exception:
        body = ""

    ordered = sorted(asset_fragments(app, path).items(), key=asset_sort_key)
    # Strip first: an older file-writing build may have left a block on disk.
    for _key, entry in ordered:
        body = asset_strip_block(body, entry["start"], entry["end"])
    body = body.rstrip()

    for key, entry in ordered:
        try:
            block = (entry["js"]() or "").strip()
        except Exception as exc:
            mark = (path, key, type(exc).__name__)
            if mark not in _ASSET_WARNED:
                if len(_ASSET_WARNED) > 256:
                    _ASSET_WARNED.clear()
                _ASSET_WARNED.add(mark)
                logging.getLogger("owui-shared-assets").warning(
                    "fragment %r failed for %s - it will be omitted",
                    key,
                    path,
                    exc_info=True,
                )
            continue
        if block:
            body = (body + "\n\n" if body else "") + block
    return body + "\n" if body else ""


def asset_register(
    app: Any, path: str, key: str, start: str, end: str, producer, order: int = 0
) -> None:
    """Publish a fragment and ensure the route exists. Idempotent, and safe
    from any plugin in any order."""
    from starlette.responses import Response
    from starlette.routing import Mount, Route

    asset_fragments(app, path)[key] = {
        "start": start,
        "end": end,
        "js": producer,
        "order": order,
    }

    for existing in app.routes:
        if getattr(existing, ASSET_ROUTE_ATTR, None) != path:
            continue
        if getattr(existing, ASSET_IMPL_ATTR, 0) >= ASSET_IMPL_VERSION:
            return  # an equal or newer implementation already owns the route
        break  # ours is newer - fall through and replace it

    # Replaces a single-owner route from an older build, or an older impl of
    # this block. Fragments live on app.state, so nothing is lost.
    app.routes[:] = [r for r in app.routes if getattr(r, "path", "") != path]
    media_type = SHARED_ASSET_TYPES.get(path, "text/plain; charset=utf-8")

    async def serve_asset(request):
        content = asset_compose(app, path)
        etag = (
            '"owui-'
            # usedforsecurity=False: this is a cache validator, not a security
            # primitive, and a bare md5() raises ValueError on a FIPS host -
            # which would 500 the asset for every visitor.
            + hashlib.md5(
                (path + "\x00" + content).encode("utf-8"), usedforsecurity=False
            ).hexdigest()
            + '"'
        )
        # no-cache, NOT no-store: a response the browser may not store has no
        # validator, so If-None-Match is never sent and the 304 below is dead
        # code. no-cache still forbids reuse without revalidation, so a stale
        # body is impossible either way. Note a proxy may re-add no-store for
        # these paths, which puts the 304 back to sleep - that is deployment
        # policy, not this block's business.
        headers = {
            "Cache-Control": "no-cache, must-revalidate, private",
            "ETag": etag,
        }
        if request.headers.get("if-none-match") == etag:
            return Response(status_code=304, headers=headers)
        # Starlette only auto-appends charset for text/*, so JS would ship
        # undeclared and readers guessing latin-1 get mojibake.
        return Response(content, media_type=media_type, headers=headers)

    insert_at = len(app.routes)
    for position, existing in enumerate(app.routes):
        if isinstance(existing, Mount) and getattr(existing, "name", "") == "static":
            insert_at = position
            break
    shared = Route(path, serve_asset, methods=["GET"])
    setattr(shared, ASSET_ROUTE_ATTR, path)
    setattr(shared, ASSET_IMPL_ATTR, ASSET_IMPL_VERSION)
    app.routes.insert(insert_at, shared)


# =========================== end shared asset block ========================


PROSE = "#response-content-container>div>.markdown-prose>"
TEXT_TAGS = (
    "p",
    "ul",
    "ol",
    "blockquote",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "div[data-tb-table]",
    "[data-tb-math]",
)
BUBBLE_TAGS = TEXT_TAGS + ("div[data-tb-code]", "[data-tb-embed]")


def _expand(css: str) -> str:
    """Write each rule that targets P once per bubble tag, or T once per text bubble tag, as a selector list."""
    rules = []
    for line in css.strip().splitlines():
        head, brace, body = line.partition("{")
        for token, tags in (("P", BUBBLE_TAGS), ("T", TEXT_TAGS)):
            if re.search(rf"(?<=\s){token}(?=[\s{{\[:])", head + brace):
                head = ",".join(
                    re.sub(rf"(?<=\s){token}(?=$|[\s\[:])", PROSE + tag, head)
                    for tag in tags
                )
        rules.append(head + brace + body)
    return "\n".join(rules)


TB_CSS = _expand(r"""
[data-tb="on"],[data-tb-live]{--tb-dot:var(--color-gray-400,#a3a3a3);--tb-bubble:var(--color-gray-100,#ececec)}
html.dark [data-tb="on"],html.dark [data-tb-live]{--tb-dot:var(--color-gray-500,#737373);--tb-bubble:var(--color-gray-850,#1c1c1c)}
[data-tb="on"] #response-content-container>div>.markdown-prose{display:flex;flex-direction:column;align-items:flex-start;gap:.375rem;padding:.375rem 0}
[data-tb="on"] P{width:fit-content;max-width:90%;margin:0!important;padding:.375rem 1rem;border:0;border-radius:1.5rem;background:var(--tb-bubble);overflow-wrap:anywhere}
[data-tb="on"] #response-content-container>div>.markdown-prose>ul,[data-tb="on"] #response-content-container>div>.markdown-prose>ol{padding-inline-start:2.25rem}
[data-tb="on"] #response-content-container>div>.markdown-prose>h1,[data-tb="on"] #response-content-container>div>.markdown-prose>h2,[data-tb="on"] #response-content-container>div>.markdown-prose>h3,[data-tb="on"] #response-content-container>div>.markdown-prose>h4,[data-tb="on"] #response-content-container>div>.markdown-prose>h5,[data-tb="on"] #response-content-container>div>.markdown-prose>h6{font-size:inherit;font-weight:inherit;line-height:inherit;letter-spacing:inherit}
[data-tb-live] P:not([data-tb-shown]){display:none!important}
[data-tb-live] P[data-tb-hold="next"]:not([data-tb-shown]){display:block!important;padding:.375rem 1rem!important;font-size:0!important;line-height:0!important}
[data-tb-live] P[data-tb-hold="next"]>*{display:none!important}
[data-tb-live] P[data-tb-hold="next"]::after{content:"";display:block;width:34px;height:16px;margin:4px 0;background:radial-gradient(circle closest-side,var(--tb-dot) 92%,transparent) 0 50%/8px 8px no-repeat,radial-gradient(circle closest-side,var(--tb-dot) 92%,transparent) 13px 50%/8px 8px no-repeat,radial-gradient(circle closest-side,var(--tb-dot) 92%,transparent) 26px 50%/8px 8px no-repeat;animation:tb-dots 1.2s ease-in-out infinite}
[data-tb-live] P[data-tb-shown]{transform-origin:0 100%;animation:tb-pop .18s ease-out}
html [data-tb-live]:not([data-tb="on"]) #response-content-container>div>span.animate-pulse.align-text-bottom{display:block!important;width:fit-content!important;height:auto!important;margin:.375rem 0!important;padding:.375rem 1rem!important;border-radius:1.5rem!important;background:var(--tb-bubble)!important;opacity:1!important;animation:none!important}
html:not([data-osk]) [data-tb-live]:not([data-tb="on"]) #response-content-container>div>span.animate-pulse.align-text-bottom>*{display:none!important}
html:not([data-osk]) [data-tb-live]:not([data-tb="on"]) #response-content-container>div>span.animate-pulse.align-text-bottom::after{content:"";display:block;width:34px;height:16px;margin:4px 0;background:radial-gradient(circle closest-side,var(--tb-dot) 92%,transparent) 0 50%/8px 8px no-repeat,radial-gradient(circle closest-side,var(--tb-dot) 92%,transparent) 13px 50%/8px 8px no-repeat,radial-gradient(circle closest-side,var(--tb-dot) 92%,transparent) 26px 50%/8px 8px no-repeat;animation:tb-dots 1.2s ease-in-out infinite}
html [data-tb="on"] #response-content-container>div>span.animate-pulse.align-text-bottom{display:none!important}
.tb-osk-bubble{display:none}
html[data-osk] [data-tb-live]:not([data-tb="on"]) #response-content-container>div>span.animate-pulse.align-text-bottom{display:flex!important;align-items:center;min-height:2.25rem!important}
html[data-osk] [data-tb-live][data-tb-osk] #response-content-container>div>.markdown-prose>.tb-osk-bubble{display:flex;align-items:center;width:fit-content;max-width:90%;min-height:2.25rem;padding:.375rem 1rem;border-radius:1.5rem;background:var(--tb-bubble)}
html[data-osk] [data-tb-live][data-tb-osk] #response-content-container>div>.markdown-prose>[data-tb-hold="next"]:not([data-tb-shown]){display:none!important}
html[data-osk] [data-tb-live]:not([data-tb="on"]) #response-content-container>div>span.animate-pulse.align-text-bottom>.osk,html[data-osk] [data-tb-live][data-tb-osk] #response-content-container>div>.markdown-prose>.tb-osk-bubble>.osk{display:flex!important;align-items:center;flex:1 1 auto}
html[data-osk] [data-tb-live]:not([data-tb="on"]) #response-content-container>div>span.animate-pulse.align-text-bottom>.osk>*,html[data-osk] [data-tb-live][data-tb-osk] #response-content-container>div>.markdown-prose>.tb-osk-bubble>.osk>*{margin-left:0!important;margin-right:0!important}
html[data-osk="bars"] [data-tb-live]:not([data-tb="on"]) #response-content-container>div>span.animate-pulse.align-text-bottom,html[data-osk="shimmer"] [data-tb-live]:not([data-tb="on"]) #response-content-container>div>span.animate-pulse.align-text-bottom{width:16rem!important;max-width:90%!important}
html[data-osk="bars"] [data-tb-live][data-tb-osk] #response-content-container>div>.markdown-prose>.tb-osk-bubble,html[data-osk="shimmer"] [data-tb-live][data-tb-osk] #response-content-container>div>.markdown-prose>.tb-osk-bubble{width:16rem}
html[data-osk]:not(.dark) [data-tb-live]:not([data-tb="on"]) #response-content-container>div>span.animate-pulse.align-text-bottom,html[data-osk]:not(.dark) [data-tb-live][data-tb-osk] #response-content-container>div>.markdown-prose>.tb-osk-bubble{--color-gray-200:oklch(.85 0 0)}
html[data-osk][data-tb-color] [data-tb-live]:not([data-tb="on"]) #response-content-container>div>span.animate-pulse.align-text-bottom,html[data-osk][data-tb-color] [data-tb-live][data-tb-osk] #response-content-container>div>.markdown-prose>.tb-osk-bubble{--color-gray-50:var(--tb-user-dot);--color-gray-300:var(--tb-user-dot);--color-gray-400:var(--tb-user-dot);--color-gray-500:var(--tb-user-dot);--color-gray-600:var(--tb-user-dot);--color-gray-200:var(--tb-user-chip);--color-gray-700:var(--tb-user-chip)}
html[data-osk][data-tb-color] [data-tb-live]:not([data-tb="on"]) #response-content-container>div>span.animate-pulse.align-text-bottom .osk-dot-core,html[data-osk][data-tb-color] [data-tb-live][data-tb-osk] #response-content-container>div>.markdown-prose>.tb-osk-bubble .osk-dot-core{background:var(--tb-user-text)!important}
[data-tb-live] .buttons>:not(.self-center.min-w-fit),[data-tb-live] .buttons>:not(.self-center.min-w-fit) *{opacity:0!important;pointer-events:none!important}
[data-tb="on"] #response-content-container>div>.markdown-prose>hr{display:none!important}
[data-tb="on"] #response-content-container>div>.markdown-prose>p,[data-tb="on"] #response-content-container>div>.markdown-prose>ul,[data-tb="on"] #response-content-container>div>.markdown-prose>ol,[data-tb="on"] #response-content-container>div>.markdown-prose>blockquote,[data-tb="on"] #response-content-container>div>.markdown-prose>h1,[data-tb="on"] #response-content-container>div>.markdown-prose>h2,[data-tb="on"] #response-content-container>div>.markdown-prose>h3,[data-tb="on"] #response-content-container>div>.markdown-prose>h4,[data-tb="on"] #response-content-container>div>.markdown-prose>h5,[data-tb="on"] #response-content-container>div>.markdown-prose>h6{white-space:pre-line}
[data-tb="on"] #response-content-container>div>.markdown-prose>[data-tb-math]{display:block;overflow-x:auto}
[data-tb="on"] #response-content-container>div>.markdown-prose>div[data-tb-code]{padding:.375rem;border-radius:1.375rem}
[data-tb="on"] #response-content-container>div>.markdown-prose>[data-tb-embed]{width:90%;padding:.375rem;border-radius:1.375rem}
[data-tb-live] #response-content-container>div>.markdown-prose>div[data-tb-embed][data-tb-hold="next"]:not([data-tb-shown]){width:fit-content}
[data-tb-live] #response-content-container>div>.markdown-prose>iframe[data-tb-embed][data-tb-hold="next"]:not([data-tb-shown]),[data-tb-live] #response-content-container>div>.markdown-prose>video[data-tb-embed][data-tb-hold="next"]:not([data-tb-shown]),[data-tb-live] #response-content-container>div>.markdown-prose>audio[data-tb-embed][data-tb-hold="next"]:not([data-tb-shown]){display:none!important}
[data-tb="on"] #response-content-container>div>.markdown-prose>[data-tb-math] .katex-display{margin:.25rem 0}
[data-tb-held]{display:none!important}
html:not(.dark) [data-tb="on"] P{--color-gray-100:var(--color-gray-200,#e5e5e5)}
html[data-tb-color] [data-tb="on"],html[data-tb-color] [data-tb-live]{--tb-bubble:var(--tb-user-bubble);--tb-dot:var(--tb-user-dot)}
html[data-tb-color] [data-tb="on"] T{color:var(--tb-user-text)!important;--tw-prose-body:var(--tb-user-text);--tw-prose-headings:var(--tb-user-text);--tw-prose-lead:var(--tb-user-text);--tw-prose-bold:var(--tb-user-text);--tw-prose-links:var(--tb-user-text);--tw-prose-counters:var(--tb-user-text);--tw-prose-bullets:var(--tb-user-text);--tw-prose-quotes:var(--tb-user-text);--tw-prose-captions:var(--tb-user-text)}
html[data-tb-color] [data-tb="on"] #response-content-container>div>.markdown-prose>div[data-tb-table] table,html[data-tb-color] [data-tb="on"] #response-content-container>div>.markdown-prose>div[data-tb-table] thead{color:var(--tb-user-text)!important}
html[data-tb-color] [data-tb="on"] T a{color:var(--tb-user-text)!important;text-decoration-color:var(--tb-user-dot)!important}
html[data-tb-color] [data-tb="on"] T code.codespan{color:var(--tb-user-text)!important;background:var(--tb-user-chip)!important}
.tb-color{display:flex;flex-shrink:0;align-items:center;justify-content:flex-end;gap:6px}
.tb-swatch{-webkit-appearance:none;appearance:none;flex-shrink:0;width:18px;height:18px;padding:0;border:1px solid var(--color-gray-300,#d4d4d4);border-radius:9999px;background:none;cursor:pointer;overflow:hidden}
html.dark .tb-swatch{border-color:var(--color-gray-700,#404040)}
.tb-swatch::-webkit-color-swatch-wrapper{padding:0}
.tb-swatch::-webkit-color-swatch{border:none;border-radius:9999px}
.tb-swatch::-moz-color-swatch{border:none;border-radius:9999px}
.tb-hex{width:4.25rem;padding:0;border:0;background:transparent;outline:none;font:inherit;font-size:.75rem;font-variant-numeric:tabular-nums;text-align:right;color:inherit}
.tb-hex::placeholder{color:inherit;opacity:.7}
@keyframes tb-pop{from{opacity:0;transform:scale(.92) translateY(4px)}}
@keyframes tb-dots{0%,60%,100%{background-position:0 50%,13px 50%,26px 50%}15%{background-position:0 0,13px 50%,26px 50%}30%{background-position:0 50%,13px 0,26px 50%}45%{background-position:0 50%,13px 50%,26px 0}}
""")

LOADER_SCRIPT = r"""
(function () {
  'use strict';
  if (window.__owuiTextingBubbles) return;
  var CFG = __CONFIG__;
  window.__owuiTextingBubbles = CFG;
  var CSS = __CSS__;
  var PROSE = '#response-content-container > div > .markdown-prose';
  var CURSOR = '#response-content-container > div > span.animate-pulse.align-text-bottom';
  var TEXT = /^(P|UL|OL|BLOCKQUOTE|H[1-6])$/;
  var COLOR_KEY = 'owui-texting-bubbles-color';
  var HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
  var STATUS = '.chat-assistant > div > div > button[aria-expanded]';
  var FOLLOW_UPS = 'div.my-2\\.5 > div.mt-4 > div.flex.flex-col.text-left';
  var states = {};
  var oskMarkup = null;
  var scheduled = false;
  var wakeTimer = null;
  var wakeAt = 0;

  function ensureStyle() {
    if (document.getElementById('owui-tb-style')) return;
    var style = document.createElement('style');
    style.id = 'owui-tb-style';
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function targeted(root) {
    if (CFG.all) return true;
    var img = root.querySelector('img.assistant-message-profile-image');
    if (img) {
      var id = null;
      try { id = new URL(img.getAttribute('src') || '', location.href).searchParams.get('id'); } catch (e) {}
      if (id && CFG.ids.indexOf(id) !== -1) return true;
    }
    var name = root.querySelector('#response-message-model-name');
    return !!name && CFG.ids.indexOf(name.textContent.trim()) !== -1;
  }

  function isTable(el) {
    var scroller = el.tagName === 'DIV' ? el.firstElementChild : null;
    var table = scroller ? scroller.firstElementChild : null;
    return !!table && table.tagName === 'TABLE';
  }

  function isCode(el) {
    var box = el.tagName === 'DIV' ? el.firstElementChild : null;
    return !!box && box.tagName === 'DIV' && box.getAttribute('dir') === 'ltr' && box.classList.contains('overflow-clip');
  }

  function isEmbed(el) {
    return /^(IFRAME|VIDEO|AUDIO)$/.test(el.tagName) || (el.tagName === 'DIV' && !!el.querySelector('iframe, video, audio'));
  }

  function isDetails(el) {
    if (el.tagName !== 'DIV') return false;
    for (var i = 0; i < el.children.length; i++) {
      var kid = el.children[i];
      if (kid.matches('button[aria-expanded], [role="button"]')) return true;
      for (var j = 0; j < kid.children.length; j++) {
        if (kid.children[j].matches('[role="button"][aria-expanded]')) return true;
      }
    }
    return false;
  }

  function isMath(el) {
    return (el.tagName === 'DIV' || el.tagName === 'SPAN') && el.classList.contains('cursor-pointer') && !!el.querySelector('.katex');
  }

  function pause(text) {
    if (!CFG.pause.on) return 0;
    return Math.min(CFG.pause.max, CFG.pause.base + CFG.pause.perChar * text.length);
  }

  function setAttr(el, name, value) {
    if (value === null) {
      if (el.hasAttribute(name)) el.removeAttribute(name);
    } else if (el.getAttribute(name) !== value) {
      el.setAttribute(name, value);
    }
  }

  function statusBlock(root) {
    var toggle = root.querySelector(STATUS);
    return toggle ? toggle.parentElement : null;
  }

  function followUps(root) {
    var list = root.querySelector(FOLLOW_UPS);
    return list ? list.parentElement.parentElement : null;
  }

  function release(root) {
    setAttr(root, 'data-tb-live', null);
    var status = statusBlock(root);
    if (status) setAttr(status, 'data-tb-held', null);
    var suggestions = followUps(root);
    if (suggestions) setAttr(suggestions, 'data-tb-held', null);
    setAttr(root, 'data-tb-osk', null);
    var waits = root.querySelectorAll('.tb-osk-bubble');
    for (var w = 0; w < waits.length; w++) waits[w].remove();
    var marked = root.querySelectorAll(PROSE + ' > [data-tb-hold], ' + PROSE + ' > [data-tb-shown]');
    for (var i = 0; i < marked.length; i++) {
      marked[i].removeAttribute('data-tb-hold');
      marked[i].removeAttribute('data-tb-shown');
    }
  }

  function waitMarkup() {
    if (!document.documentElement.hasAttribute('data-osk')) return null;
    if (oskMarkup === null) {
      var source = document.querySelector('.osk-host > .osk');
      if (source) oskMarkup = source.innerHTML;
    }
    return oskMarkup;
  }

  function placeWait(root, next) {
    var wait = root.querySelector(PROSE + ' > .tb-osk-bubble');
    var markup = next ? waitMarkup() : null;
    if (!markup) {
      if (wait) wait.remove();
      setAttr(root, 'data-tb-osk', null);
      return;
    }
    if (!wait) {
      wait = document.createElement('div');
      wait.className = 'tb-osk-bubble';
      wait.setAttribute('aria-hidden', 'true');
      wait.innerHTML = '<span class="osk">' + markup + '</span>';
    }
    if (wait.parentNode !== next.parentNode || wait.previousElementSibling !== next) next.parentNode.insertBefore(wait, next.nextSibling);
    setAttr(root, 'data-tb-osk', '');
  }

  function wake(at) {
    if (wakeTimer !== null && wakeAt <= at) return;
    if (wakeTimer !== null) clearTimeout(wakeTimer);
    wakeAt = at;
    wakeTimer = setTimeout(function () {
      wakeTimer = null;
      schedule();
    }, Math.max(0, at - performance.now()));
  }

  function update(root, now) {
    var id = root.id.slice('message-'.length);
    var state = states[id];
    if (!state) {
      state = states[id] = { root: root, seen: false, live: false, shown: 0, since: now, statusBase: null };
    } else if (state.root !== root) {
      state.root = root;
      if (!root.querySelector(CURSOR)) state.live = false;
    }

    var texts = [];
    var plain = true;
    var proses = root.querySelectorAll(PROSE);
    for (var i = 0; i < proses.length && plain; i++) {
      var kids = proses[i].children;
      for (var j = 0; j < kids.length; j++) {
        if (kids[j].tagName === 'HR' || kids[j].classList.contains('tb-osk-bubble') || isDetails(kids[j])) continue;
        if (isTable(kids[j])) setAttr(kids[j], 'data-tb-table', '');
        else if (isCode(kids[j])) setAttr(kids[j], 'data-tb-code', '');
        else if (isMath(kids[j])) setAttr(kids[j], 'data-tb-math', '');
        else if (isEmbed(kids[j])) setAttr(kids[j], 'data-tb-embed', '');
        else if (!TEXT.test(kids[j].tagName)) {
          plain = false;
          break;
        }
        texts.push(kids[j]);
      }
    }
    if (!plain || !targeted(root)) {
      release(root);
      setAttr(root, 'data-tb', null);
      return;
    }
    var streaming = !!root.querySelector(CURSOR);
    if (!state.seen && (streaming || texts.length)) {
      state.seen = true;
      state.live = streaming;
    }
    if (state.live) setAttr(root, 'data-tb-live', '');
    if (!texts.length) {
      setAttr(root, 'data-tb', null);
      return;
    }
    if (!state.caughtUp) {
      state.caughtUp = true;
      if (state.live && texts.length > 1) {
        state.shown = texts.length - 1;
        state.since = now;
      }
    }

    setAttr(root, 'data-tb', 'on');
    if (!state.live) {
      release(root);
      return;
    }

    var status = statusBlock(root);
    var statusText = status ? status.textContent : '';
    if (state.statusBase === null) state.statusBase = streaming ? statusText : '';
    if (status) setAttr(status, 'data-tb-held', statusText !== state.statusBase ? '' : null);
    var suggestions = followUps(root);
    if (suggestions) setAttr(suggestions, 'data-tb-held', '');

    while (state.shown < texts.length) {
      if (streaming && state.shown === texts.length - 1) break;
      var due = state.since + pause(texts[state.shown].textContent);
      if (now < due) {
        wake(due);
        break;
      }
      state.shown++;
      state.since = now;
    }
    if (state.shown >= texts.length && !streaming) {
      state.live = false;
      release(root);
      return;
    }
    var shownNow = streaming ? Math.min(state.shown, texts.length - 1) : state.shown;
    for (var k = 0; k < texts.length; k++) {
      setAttr(texts[k], 'data-tb-shown', k < shownNow ? '' : null);
      setAttr(texts[k], 'data-tb-hold', k === shownNow ? 'next' : null);
    }
    placeWait(root, shownNow < texts.length ? texts[shownNow] : null);
  }

  function normalize(value) {
    var match = HEX.exec(String(value || '').trim());
    if (!match) return null;
    var hex = match[1].length === 3 ? match[1].replace(/./g, '$&$&') : match[1];
    return '#' + hex.toLowerCase();
  }

  function savedColor() {
    var value = null;
    try { value = localStorage.getItem(COLOR_KEY); } catch (e) {}
    return normalize(value);
  }

  function activeColor() {
    return savedColor() || normalize(CFG.color);
  }

  function luminance(hex) {
    var channels = [1, 3, 5].map(function (i) {
      var c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  function applyColor() {
    var html = document.documentElement;
    var color = activeColor();
    if (!color) {
      html.removeAttribute('data-tb-color');
      ['--tb-user-bubble', '--tb-user-text', '--tb-user-dot', '--tb-user-chip'].forEach(function (name) { html.style.removeProperty(name); });
      return;
    }
    var light = luminance(color);
    var white = 1.05 / (light + 0.05) >= (light + 0.05) / 0.05;
    html.style.setProperty('--tb-user-bubble', color);
    html.style.setProperty('--tb-user-text', white ? '#ffffff' : '#111111');
    html.style.setProperty('--tb-user-dot', white ? 'rgba(255, 255, 255, 0.65)' : 'rgba(17, 17, 17, 0.5)');
    html.style.setProperty('--tb-user-chip', white ? 'rgba(255, 255, 255, 0.18)' : 'rgba(17, 17, 17, 0.12)');
    html.setAttribute('data-tb-color', '');
  }

  function syncColorRow() {
    var swatch = document.getElementById('tb-color-swatch');
    var hex = document.getElementById('tb-color-hex');
    var reset = document.getElementById('tb-color-reset');
    if (!swatch) return;
    var dark = document.documentElement.classList.contains('dark');
    swatch.value = activeColor() || (dark ? '#262626' : '#fafafa');
    if (document.activeElement !== hex) hex.value = savedColor() || '';
    reset.hidden = !savedColor();
  }

  function setColor(color) {
    try {
      if (color) localStorage.setItem(COLOR_KEY, color);
      else localStorage.removeItem(COLOR_KEY);
    } catch (e) {}
    applyColor();
    syncColorRow();
  }

  function colorRow() {
    if (document.getElementById('tb-color-setting')) return;
    var anchor = document.getElementById('chat-bubble-ui-label');
    if (!anchor || !anchor.closest('#tab-interface')) return;
    var row = anchor.parentElement;
    var wrapper = row && row.parentElement;
    if (!wrapper || !wrapper.parentElement) return;
    var after = document.getElementById('osk-setting') || wrapper;

    var block = document.createElement('div');
    block.id = 'tb-color-setting';
    var line = document.createElement('div');
    line.className = row.className || 'flex items-center justify-between gap-2.5';
    var name = document.createElement('div');
    name.id = 'tb-color-label';
    name.className = anchor.className || 'min-w-0 text-xs text-gray-600 dark:text-gray-400';
    name.textContent = 'Message Bubble Color';
    var control = document.createElement('div');
    control.className = 'tb-color text-xs text-gray-500';

    var reset = document.createElement('button');
    reset.type = 'button';
    reset.id = 'tb-color-reset';
    reset.className = 'text-xs text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-500 dark:hover:text-white';
    reset.textContent = 'Reset';
    reset.addEventListener('click', function () { setColor(null); });

    var hex = document.createElement('input');
    hex.type = 'text';
    hex.id = 'tb-color-hex';
    hex.className = 'tb-hex';
    hex.maxLength = 7;
    hex.spellcheck = false;
    hex.autocomplete = 'off';
    hex.placeholder = 'Default';
    hex.setAttribute('aria-label', 'Message bubble color hex code');
    hex.addEventListener('input', function () {
      var color = normalize(hex.value);
      if (color) setColor(color);
    });
    hex.addEventListener('change', function () {
      if (!hex.value.trim()) setColor(null);
      hex.value = savedColor() || '';
    });
    hex.addEventListener('keydown', function (evt) {
      if (evt.key === 'Enter') hex.blur();
    });

    var swatch = document.createElement('input');
    swatch.type = 'color';
    swatch.id = 'tb-color-swatch';
    swatch.className = 'tb-swatch';
    swatch.setAttribute('aria-labelledby', 'tb-color-label');
    swatch.addEventListener('input', function () { setColor(normalize(swatch.value)); });

    control.appendChild(reset);
    control.appendChild(hex);
    control.appendChild(swatch);
    line.appendChild(name);
    line.appendChild(control);
    var note = document.createElement('p');
    note.className = 'mt-1.5 text-[0.6875rem] text-gray-400 dark:text-gray-600';
    note.textContent = 'Background color of chat bubbles in replies. The text turns black or white to stay readable. Saved in this browser.';
    block.appendChild(line);
    block.appendChild(note);
    after.parentElement.insertBefore(block, after.nextSibling);
    syncColorRow();
  }

  function scan() {
    scheduled = false;
    var now = performance.now();
    var replies = document.querySelectorAll('.chat-assistant');
    for (var i = 0; i < replies.length; i++) {
      var root = replies[i].closest('[id^="message-"]');
      if (root) update(root, now);
    }
    colorRow();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(scan);
  }

  ensureStyle();
  applyColor();
  window.addEventListener('storage', function (evt) {
    if (evt.key !== COLOR_KEY) return;
    applyColor();
    syncColorRow();
  });
  new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      if (records[i].type === 'childList') return scan();
      var parent = records[i].target.parentElement;
      if (parent && parent.closest('[data-tb-live]')) return scan();
    }
    schedule();
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  schedule();
})();
"""


class Event:
    class Valves(BaseModel):
        bubble_color: str = Field(
            default="",
            pattern=r"^(#[0-9a-fA-F]{6})?$",
            description="Bubble color as a hex code such as #3b82f6, for people who have not picked their own under Settings > Interface. Empty keeps Open WebUI's gray.",
        )
        model_ids: str = Field(
            default="",
            description="Comma-separated model IDs or names whose replies get bubbles. Empty gives every model bubbles.",
        )
        typing_pauses: bool = Field(
            default=True,
            description="Wait a typing pause before revealing each bubble. Off reveals each bubble as soon as its message is complete. Either way, a bubble never shows half-written text.",
        )
        pause_base_ms: int = Field(
            default=600,
            ge=0,
            le=10000,
            description="Milliseconds every typing pause lasts at least.",
        )
        pause_per_character_ms: int = Field(
            default=18,
            ge=0,
            le=200,
            description="Milliseconds added to a typing pause for each character in the bubble, so longer texts take longer to type.",
        )
        pause_max_ms: int = Field(
            default=3500,
            ge=0,
            le=20000,
            description="Longest a single typing pause can last, in milliseconds.",
        )

    LOADER_BLOCK_START = "// owui-texting-bubbles:start"
    LOADER_BLOCK_END = "// owui-texting-bubbles:end"
    ASSET_KEY = "texting-bubbles"
    ASSET_ORDER = 0

    _function_disabled = False
    _disabled_cache = None
    _disabled_at = 0.0
    _marker_ok = True
    _current_instance = None
    _fragment_cache = None

    def __init__(self):
        self.valves = self.Valves()

    @staticmethod
    def _disabled_marker() -> Path:
        from open_webui.env import DATA_DIR

        return Path(DATA_DIR) / STORE_DIR_NAME / "disabled"

    @classmethod
    def _set_disabled(cls, disabled: bool) -> None:
        cls._function_disabled = disabled
        cls._disabled_at = time.time() if disabled else 0.0
        cls._disabled_cache = (time.monotonic(), disabled)
        cls._fragment_cache = None
        try:
            marker = cls._disabled_marker()
            if disabled:
                marker.parent.mkdir(parents=True, exist_ok=True)
                marker.touch()
            else:
                marker.unlink(missing_ok=True)
            cls._marker_ok = True
        except OSError:
            cls._marker_ok = False
            log.exception(
                "[Texting Bubbles] Could not record the on/off state for other workers"
            )

    @classmethod
    def _is_disabled(cls) -> bool:
        now = time.monotonic()
        cached = cls._disabled_cache
        if cached and now - cached[0] < DISABLED_CHECK_SECONDS:
            return cached[1]
        if cls._marker_ok:
            try:
                disabled = cls._disabled_marker().exists()
            except OSError:
                disabled = cls._function_disabled
        else:
            disabled = cls._function_disabled
        cls._disabled_cache = (now, disabled)
        return disabled

    @classmethod
    def _disabled_age(cls) -> float:
        try:
            return time.time() - cls._disabled_marker().stat().st_mtime
        except OSError:
            return time.time() - cls._disabled_at if cls._disabled_at else 0.0

    def _loader_fragment(self) -> str:
        models = [
            entry.strip()
            for entry in (self.valves.model_ids or "").split(",")
            if entry.strip()
        ]
        targets = {"all": not models, "ids": models, "color": self.valves.bubble_color}
        pause = {
            "on": self.valves.typing_pauses,
            "base": self.valves.pause_base_ms,
            "perChar": self.valves.pause_per_character_ms,
            "max": self.valves.pause_max_ms,
        }
        cache_key = (Event._is_disabled(), _json.dumps([targets, pause]))
        cached = Event._fragment_cache
        if cached and cached[0] == cache_key:
            return cached[1]
        if cache_key[0]:
            fragment = ""
        else:
            config = _json.dumps(dict(targets, pause=pause))
            js = (
                LOADER_SCRIPT.strip()
                .replace("__CONFIG__", config)
                .replace("__CSS__", _json.dumps(TB_CSS.strip()))
            )
            fragment = f"{self.LOADER_BLOCK_START}\n{js}\n{self.LOADER_BLOCK_END}"
        Event._fragment_cache = (cache_key, fragment)
        return fragment

    def _publish(self, app) -> None:
        asset_register(
            app,
            LOADER_PATH,
            self.ASSET_KEY,
            self.LOADER_BLOCK_START,
            self.LOADER_BLOCK_END,
            self._loader_fragment,
            order=self.ASSET_ORDER,
        )

    async def event(
        self,
        event: dict,
        __event_name__: str = None,
        __id__: str = None,
        __app__=None,
        **kwargs,
    ) -> None:
        if __event_name__ in ("system.shutdown.started", "system.shutdown.completed"):
            return

        own_toggle = ((event or {}).get("subject") or {}).get("id") == __id__
        if __event_name__ == "function.disable_started" and own_toggle:
            Event._set_disabled(True)
            return

        if __event_name__ == "function.enable_started" and own_toggle:
            Event._set_disabled(False)
        elif Event._is_disabled():
            if Event._disabled_age() < STALE_MARKER_SECONDS:
                return
            Event._set_disabled(False)

        Event._current_instance = self
        if __app__ is None:
            return
        try:
            self._publish(__app__)
        except Exception:
            log.exception("[Texting Bubbles] Could not publish the loader fragment")

