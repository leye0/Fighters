#!/usr/bin/env python3
"""Drive Adobe Mixamo's real website on original Fighters FBX rigs.

This is a browser operator, NOT a retargeter and NOT an unofficial Adobe API.
- Uses local persistent Playwright profile for an Adobe session (login once).
- Finds the original seven catalog motions by original title + description,
  refusing ambiguous similarly named Walking variants.
- Downloads FBX With Skin @ 30 FPS on THAT uploaded character.
- Never uploads browser credentials, source FBXs or animations to Git.
- Fails closed when Adobe cannot map the rig or requests human markers.

Examples:
  python3 scripts/mixamo-direct-batch.py --login-only
  python3 scripts/mixamo-direct-batch.py --character claudia \
    --input-dir /private/clean-fbx --output-dir /private/animated-fbx
  # CI with already-authorized temporary state:
  # MIXAMO_STORAGE_STATE_B64=... python3 scripts/mixamo-direct-batch.py --headless ...
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import time
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
SOURCE_CATALOG = ROOT / "assets/mixamo-available-clips.json"
MOTION_FILES = (
    "Fighting_Idle.fbx", "Walking_21.fbx", "Walking_6.fbx",
    "Walking_Backwards.fbx", "Left_Turn_3.fbx", "Jump.fbx",
    "Falling_Idle.fbx",
)
MIXAMO = "https://www.mixamo.com/"
FILE_MAGIC = b"Kaydara FBX Binary"
SEARCH = "https://www.mixamo.com/#/?page={page}&type=Motion%2CMotionPack&query={query}"


class MixamoBlocked(RuntimeError):
    pass


def must(ok, message):
    if not ok:
        raise MixamoBlocked(message)


def private_folder(path):
    result = Path(path).expanduser().resolve()
    must(result != ROOT and not result.is_relative_to(ROOT),
         "Adobe files/session must stay OUTSIDE the public Fighters repo")
    return result


def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def selected_catalog():
    data = json.loads(SOURCE_CATALOG.read_text(encoding="utf8"))
    clips = {c["filename"]: c for c in data["clips"]}
    must(all(name in clips for name in MOTION_FILES), "Source catalog is incomplete")
    return [(name, clips[name]) for name in MOTION_FILES]


def logged_in(page):
    if not page.url.startswith("https://www.mixamo.com"):
        return False
    # An authenticated page must contain the actual editing tools; absence
    # of login text alone is NOT a proof (the third-party MCP gets this wrong).
    try:
        return page.locator('button:has-text("Upload Character")').count() > 0
    except Exception:
        return False


def wait_for_auth(page, interactive):
    page.goto(MIXAMO, wait_until="domcontentloaded", timeout=60000)
    try:
        page.locator('button:has-text("Upload Character")').first.wait_for(timeout=20000)
    except Exception:
        if not interactive:
            raise MixamoBlocked("Adobe session not authenticated; run --login-only in a visible local browser first")
        print("ADOBE_LOGIN_REQUIRED: Please authenticate in the visible browser.")
        deadline = time.monotonic() + 240
        while time.monotonic() < deadline and not logged_in(page):
            page.wait_for_timeout(1250)
        must(logged_in(page), "Adobe login was not completed in the local browser")
    must(logged_in(page), "Adobe login cannot be verified using actual editor controls")


def upload(page, path, character):
    must(path.is_file() and path.stat().st_size > 2000, "Missing original FBX: " + str(path))
    print("MIXAMO_UPLOAD", character, path.name, flush=True)
    page.locator('button:has-text("Upload Character")').first.click(timeout=15000)
    try:
        page.locator('a:has-text("Select character file")').first.wait_for(timeout=15000)
    except Exception:
        # When Mixamo asks about replacing the last selected avatar, confirm
        # only the intended upload operation, never any account-wide deletion.
        if "change_character" in page.content().lower() or "Change Character" in page.content():
            page.locator(".autorig-modal .modal-footer button.btn-primary").first.click(timeout=10000)
            page.locator('a:has-text("Select character file")').first.wait_for(timeout=15000)
        else:
            raise
    with page.expect_file_chooser(timeout=15000) as chooser:
        page.locator('a:has-text("Select character file")').first.click()
    chooser.value.set_files(str(path))

    review_confirmed = False
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        html = page.content()
        low = html.lower()
        if ("unable to map your existing skeleton" in low or
                "unable to map" in low and "skeleton" in low):
            raise MixamoBlocked("Adobe cannot map the original " + character + " rig; do NOT retarget it silently")
        if page.locator(".autorig-overlay").count() and page.locator(".autorig-overlay").first.is_visible():
            raise MixamoBlocked("Adobe requested manual anatomically placed markers on " + character)
        if page.locator(".autorig-holder").count() and page.locator(".autorig-holder").first.is_visible() and not review_confirmed:
            # A preview/review was actually returned, not merely a progress bar.
            page.locator(".autorig-modal .modal-footer button.btn-primary").first.click(timeout=15000)
            review_confirmed = True
        if "autorig-modal" not in html:
            break
        page.wait_for_timeout(1500)
    else:
        raise MixamoBlocked("Adobe did not finish loading and mapping " + character + " within 180s")
    page.wait_for_timeout(1000)
    title = page.locator(".product-nav h2").first.inner_text(timeout=15000)
    must(norm(character).replace(" ", "") in norm(title).replace(" ", ""),
         "Cannot confirm Adobe selected " + character + "; navbar says " + repr(title))
    print("MIXAMO_CHARACTER_SELECTED", character, title, flush=True)


def cards_on_page(page):
    return page.locator(".product-animation").evaluate_all("""nodes => nodes.map(n => {
      const name = n.querySelector("p.text-capitalize")?.textContent?.trim() || "";
      const img = n.querySelector(".product-image img");
      const desc = n.querySelector(".product-metadata li")?.textContent?.replace(/^Description:\\s*/i,"").trim() || "";
      const src = img?.src || "";
      const id = src.match(/\\/motions\\/(\\d+)\\//)?.[1] || "";
      const html = n.outerHTML;
      return {name, description:desc, numericId:id, outerHTML:html.slice(0,3000)};
    })""")


def find_motion(page, filename, metadata):
    title = metadata["originalTitle"]
    desc = metadata["sourceDescription"]
    uuid = metadata["motionId"].lower()
    candidates = []
    # Browser list pages are finite (48/page). Inspect metadata on every page,
    # never just click "Walking" first; two required clips share that title.
    for n in range(1, 16):
        page.goto(SEARCH.format(page=n, query=quote(title)), wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle", timeout=30000)
        try:
            page.locator(".product-animation").first.wait_for(timeout=13000)
        except Exception:
            if n == 1:
                raise MixamoBlocked("Adobe did not return motion search for " + title)
            break
        cards = cards_on_page(page)
        for item in cards:
            if norm(item["name"]) == norm(title):
                candidates.append((n, item))
        if len(cards) < 36:
            break
    must(candidates, "No animation titled " + repr(title) + " returned by Mixamo")
    # First prefer unique original motion UUID in an asset's DOM markup,
    # then original title PLUS genuine on-screen motion description.
    exact_uuid = [(n,c) for n,c in candidates if uuid in c["outerHTML"].lower()]
    if len(exact_uuid) == 1:
        return exact_uuid[0]
    exact_desc = [(n,c) for n,c in candidates if norm(c["description"]) == norm(desc)]
    if len(exact_desc) == 1:
        return exact_desc[0]
    print("MIXAMO_AMBIGUOUS_MOTION", filename,
          json.dumps([{"page":n,"name":c["name"],"description":c["description"],
                       "siteId":c["numericId"]} for n,c in candidates[:50]]), flush=True)
    raise MixamoBlocked(
        "No UNIQUE Adobe match for " + filename + " (catalog " + repr(title) +
        " / " + repr(desc) + "). Do not substitute another motion.")


def select_motion(page, filename, metadata, found):
    n, card = found
    title = metadata["originalTitle"]
    page.goto(SEARCH.format(page=n, query=quote(title)), wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle", timeout=30000)
    page.locator(".product-animation").first.wait_for(timeout=15000)
    must(card["numericId"], "Mixamo motion thumbnail has no verifiable ID: " + filename)
    selector = '.product-animation:has(img[src*="/motions/' + card["numericId"] + '/"])'
    matches = page.locator(selector)
    must(matches.count() == 1, "Animation ID not uniquely present in Mixamo result page")
    matches.click()
    page.locator(".product-animation.product-selected").first.wait_for(timeout=20000)
    selected = cards_on_page(page)
    must(any(card["numericId"] == c["numericId"] for c in selected),
         "Selected motion is no longer visible in the site")
    must(page.locator(selector).get_attribute("class") and
         "product-selected" in page.locator(selector).get_attribute("class"),
         "Selected Mixamo card does not match the requested ID")
    print("MIXAMO_MOTION_SELECTED", filename, card["numericId"], card["name"], flush=True)


def download(page, filename, folder, character, metadata, selected):
    if filename.startswith("Walking"):
        # In-place root movement is controlled by Fighters physics. Do not
        # invent this option for animations lacking the control.
        checkbox = page.locator('input[name="inplace"]')
        if checkbox.count() > 0 and not checkbox.first.is_checked():
            checkbox.first.check()
    page.locator(".sidebar-header button.btn-primary").first.click(timeout=15000)
    modal = page.locator(".asset-download-modal")
    modal.wait_for(timeout=20000)
    selects = modal.locator("select")
    must(selects.count() >= 3, "Adobe download modal lacks format/skin/FPS choices")
    # Dispatch site framework change events; verify the actual selected values.
    for i, val in enumerate(["fbx7_2019", "true", "30"]):
        selects.nth(i).select_option(value=val, timeout=10000)
        must(selects.nth(i).input_value() == val,
             "Adobe refused download setting " + str((i,val)))
    destination = folder / filename
    temp = destination.with_suffix(".fbx.part")
    with page.expect_download(timeout=120000) as capture:
        modal.locator(".modal-footer button.btn-primary").first.click(timeout=15000)
    result = capture.value
    must(result.failure() is None, "Adobe failed FBX transfer: " + str(result.failure()))
    result.save_as(str(temp))
    raw = temp.read_bytes()
    must(len(raw) > 4096 and raw.startswith(FILE_MAGIC),
         "Adobe returned an empty, nonbinary or invalid FBX for " + filename)
    os.replace(temp, destination)
    info = {
        "character": character, "filename": filename, "provider": "adobe-mixamo.com",
        "catalogMotionId": metadata["motionId"], "siteNumericId": selected["numericId"],
        "originalTitle": metadata["originalTitle"],
        "sourceDescription": metadata["sourceDescription"],
        "download": {"format": "fbx2019", "withSkin": True, "fps": 30},
        "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw),
    }
    destination.with_suffix(".fbx.json").write_text(
        json.dumps(info, indent=2) + "\n", encoding="utf8")
    print("MIXAMO_REAL_FBX_OK", character, filename, len(raw), flush=True)


def run(args):
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as e:
        raise MixamoBlocked("Playwright not installed; pip install playwright && playwright install chromium") from e

    profile = private_folder(args.profile)
    session_b64 = os.getenv("MIXAMO_STORAGE_STATE_B64")
    if session_b64 and args.login_only:
        raise MixamoBlocked("Login-only should use a visible local persistent profile, not a CI secret")
    if not session_b64:
        profile.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = None
        if session_b64:
            browser = playwright.chromium.launch(headless=args.headless)
            # Keep session state in memory; no secret-bearing file or logs.
            state = json.loads(base64.b64decode(session_b64, validate=True))
            context = browser.new_context(storage_state=state,
                accept_downloads=True, viewport={"width":1280,"height":900})
        else:
            context = playwright.chromium.launch_persistent_context(
                user_data_dir=str(profile), headless=args.headless,
                accept_downloads=True, viewport={"width":1280,"height":900})
        page = context.pages[0] if context.pages else context.new_page()
        page.set_default_timeout(25000)
        try:
            wait_for_auth(page, interactive=not args.headless)
            if args.login_only:
                print("ADOBE_SESSION_READY: local browser profile saved outside Git", flush=True)
                return
            inputs = private_folder(args.input_dir)
            outputs = private_folder(args.output_dir)
            must(inputs.is_dir(), "Missing input FBX directory " + str(inputs))
            outputs.mkdir(parents=True, exist_ok=True)
            source = inputs / (args.character + ".fbx")
            character_folder = outputs / args.character
            character_folder.mkdir(parents=True, exist_ok=True)
            upload(page, source, args.character)
            for filename, metadata in selected_catalog():
                fbx = character_folder / filename
                stamp = fbx.with_suffix(".fbx.json")
                if fbx.is_file() and stamp.is_file():
                    doc = json.loads(stamp.read_text(encoding="utf8"))
                    valid = (doc.get("character") == args.character and
                             doc.get("catalogMotionId") == metadata["motionId"] and
                             fbx.read_bytes().startswith(FILE_MAGIC) and
                             hashlib.sha256(fbx.read_bytes()).hexdigest() == doc.get("sha256"))
                    must(valid, "Existing FBX failed provenance check: " + str(fbx))
                    print("MIXAMO_REUSE_VERIFIED", args.character, filename, flush=True)
                    continue
                found = find_motion(page, filename, metadata)
                select_motion(page, filename, metadata, found)
                download(page, filename, character_folder, args.character, metadata, found[1])
            print("MIXAMO_REAL_SEVEN_MOTIONS_READY", args.character,
                  str(character_folder), flush=True)
        finally:
            context.close()
            if browser:
                browser.close()


def cli():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--login-only", action="store_true")
    p.add_argument("--catalog-only", action="store_true",
                   help="Print the exact seven sourced motion identities; no Adobe access")
    p.add_argument("--character", choices=("claudia", "carla", "realistic-man"))
    p.add_argument("--input-dir")
    p.add_argument("--output-dir")
    p.add_argument("--profile", default=str(Path.home() / ".config/fighters/mixamo-profile"))
    p.add_argument("--headless", action="store_true")
    options = p.parse_args()
    must(options.login_only or options.catalog_only or all((options.character,options.input_dir,options.output_dir)),
         "Provide --character, --input-dir and --output-dir, or --login-only")
    try:
        if options.catalog_only:
            print(json.dumps([{"file":name,"title":c["originalTitle"],
                "description":c["sourceDescription"],"motionId":c["motionId"]}
                for name,c in selected_catalog()], indent=2))
            return
        run(options)
    except (MixamoBlocked, ValueError, OSError) as error:
        print("MIXAMO_AUTOMATION_BLOCKED:", str(error), file=sys.stderr)
        sys.exit(2)


if __name__=="__main__":
    cli()
