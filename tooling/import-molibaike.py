#!/usr/bin/env python3
"""Import explicitly selected Molibaike character GIFs into lossless WebP atlases.

Requires Python 3.10+, Pillow and requests. The source website supplies viewing assets, not
an open-source license. This importer records provenance; it does not grant any
rights. Default scope is the website's first style / unarmed selection, all 28
listed characters, all 19 listed actions and eight directions. Other variants
must be selected explicitly. Downloads are cached and failures remain visible.

Examples:
  python tooling/import-molibaike.py --roles 1024
  python tooling/import-molibaike.py
  python tooling/import-molibaike.py --roles 1024 --color 1 --weapon 3
  python tooling/import-molibaike.py --offline
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from hashlib import sha256
import html
import io
import json
from pathlib import Path
import re
import threading
import time

from PIL import Image
import requests

ROOT = Path(__file__).resolve().parents[1]
SOURCE = "https://www.molibaike.com"
DIRECTIONS = ["NW", "N", "NE", "E", "SE", "S", "SW", "W"]
NOTICE = "原站声明：所有资料来源于广大网友或者各大魔力资料站，本站所有图档等资料版权一一史克威尔艾尼克斯（中国）。未发现开放素材许可证；本目录仅记录来源，不授予使用或再分发权利。"
MAX_ATLAS_BYTES = 700_000
HTTP = threading.local()
RATE_LOCK = threading.Lock()
NEXT_REQUEST = 0.0
REQUESTS_PER_SECOND = 4.0
NETWORK_BLOCKED = threading.Event()
ERROR_LOCK = threading.Lock()
CONSECUTIVE_PROXY_DENIALS = 0
SINGLE_RETRY_URLS: set[str] = set()


class DownloadBlocked(RuntimeError):
    """An explicit access denial stops new downloads instead of changing routes."""


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n")
    temporary.replace(path)


def fetch(url: str, path: Path, offline: bool = False) -> bytes:
    if path.exists():
        return path.read_bytes()
    if offline:
        raise FileNotFoundError(f"Not cached: {url}")
    max_attempts = 1 if url in SINGLE_RETRY_URLS else 3
    for attempt in range(max_attempts):
        if NETWORK_BLOCKED.is_set():
            raise DownloadBlocked("New downloads stopped after three consecutive proxy access denials")
        global NEXT_REQUEST
        with RATE_LOCK:
            start_at = max(time.monotonic(), NEXT_REQUEST)
            NEXT_REQUEST = start_at + 1 / REQUESTS_PER_SECOND
        time.sleep(max(0, start_at - time.monotonic()))
        retry_delay = min(8.0, 2.0 ** attempt)
        try:
            if not hasattr(HTTP, "session"):
                HTTP.session = requests.Session()
                HTTP.session.headers.update({"User-Agent": "hi-story-character-import/1", "Referer": SOURCE + "/Role"})
            with HTTP.session.get(url, timeout=30, stream=True) as response:
                response.raise_for_status()
                chunks, size = [], 0
                for chunk in response.iter_content(64 * 1024):
                    size += len(chunk)
                    if size > 12_000_000:
                        raise ValueError("Asset exceeds 12 MB download limit")
                    chunks.append(chunk)
                content = b"".join(chunks)
            global CONSECUTIVE_PROXY_DENIALS
            with ERROR_LOCK:
                CONSECUTIVE_PROXY_DENIALS = 0
            path.parent.mkdir(parents=True, exist_ok=True)
            temporary = path.with_suffix(path.suffix + ".tmp")
            temporary.write_bytes(content)
            temporary.replace(path)
            return content
        except requests.HTTPError as error:
            if error.response.status_code < 500 and error.response.status_code != 429:
                raise
            if attempt == max_attempts - 1:
                raise
            # Honor Retry-After without allowing an unbounded unattended wait.
            retry_after = error.response.headers.get("Retry-After", "")
            if retry_after.isdigit():
                retry_delay = min(30, max(retry_delay, int(retry_after)))
        except requests.exceptions.ProxyError as error:
            if "Tunnel connection failed: 403" in str(error):
                with ERROR_LOCK:
                    CONSECUTIVE_PROXY_DENIALS += 1
                    if CONSECUTIVE_PROXY_DENIALS >= 3:
                        NETWORK_BLOCKED.set()
                if NETWORK_BLOCKED.is_set():
                    raise DownloadBlocked("New downloads stopped after three consecutive proxy HTTP 403 denials") from error
            if attempt == max_attempts - 1:
                raise
        except (requests.RequestException, TimeoutError, OSError):
            if attempt == max_attempts - 1:
                raise
        time.sleep(retry_delay)
    raise RuntimeError("Unreachable retry state")


def discover(cache: Path, offline: bool) -> list[dict]:
    """Read the actual role cards and select options, without inventing IDs."""
    document = fetch(SOURCE + "/Role", cache / "list.html", offline).decode()
    roles = []
    cards = re.findall(r'<a href="(/Role/Detail/[^\"]+)" class="card role-item" title="([^\"]+)"', document)
    if not cards:
        raise ValueError("Role cards were not found; source markup may have changed")
    for detail, name in cards:
        detail_url = SOURCE + html.unescape(detail)
        slug = detail.split("/Detail/")[1].split("?")[0]
        page = fetch(detail_url, cache / (slug + ".html"), offline).decode()
        role = {"detailUrl": detail_url, "name": html.unescape(name).strip()}
        match = re.search(r"var id = '(\d+)'", page)
        image = re.search(r'<img id="roleImage" src="([^\"]+)"', page)
        if not match or not image:
            raise ValueError(f"Character metadata not found: {detail_url}")
        role.update(baseId=int(match.group(1)), defaultImageUrl=SOURCE + image.group(1))
        for key in ("roleColor", "weaponType", "actionType"):
            select = re.search(r'<select\s+id="' + key + r'"[\s\S]*?</select>', page)
            if not select:
                raise ValueError(f"Missing {key}: {detail_url}")
            role[key] = [{"id": int(value), "label": html.unescape(label)} for value, label in re.findall(r'<option value="(\d+)"[^>]*>(.*?)</option>', select.group())]
        role.update(directionCount=8, candidateCount=len(role["roleColor"]) * len(role["weaponType"]) * len(role["actionType"]) * 8)
        roles.append(role)
    return roles


def decode_clip(task: dict, cache: Path, offline: bool) -> dict:
    """Keep GIF disposal/compositing and original canvas; never trim each frame."""
    path = cache / "gifs" / task["filename"]
    # Reuse the independently inspected source examples as well.
    if not path.exists() and (cache / task["filename"]).exists():
        path = cache / task["filename"]
    raw = fetch(task["sourceUrl"], path, offline)
    frames = []
    with Image.open(io.BytesIO(raw)) as image:
        if image.format != "GIF":
            raise ValueError(f"Expected GIF, got {image.format}")
        loop_count = image.info.get("loop")
        if image.n_frames > 250 or image.width > 2048 or image.height > 2048:
            raise ValueError("Unexpected source image dimensions/frame count")
        for index in range(image.n_frames):
            image.seek(index)
            frame = image.convert("RGBA").copy()
            duration = image.info.get("duration")
            if duration is None or duration <= 0:
                raise ValueError(f"Missing/non-positive GIF duration at frame {index}")
            if frame.getbbox() is None:
                raise ValueError(f"Empty GIF frame {index}")
            frames.append({"image": frame, "durationMs": duration})
        if not frames:
            raise ValueError("GIF has no frames")
        return {**task, "sourceSha256": sha256(raw).hexdigest(), "sourceBytes": len(raw), "width": image.width, "height": image.height, "sourceLoopCount": loop_count, "loop": loop_count == 0, "frames": frames}


def pack(frames: list[dict]) -> tuple[Image.Image, list[tuple[int, int]]]:
    width_limit = 2048
    x = y = row_height = used_width = 0
    positions = []
    for frame in frames:
        image = frame["image"]
        if x and x + image.width > width_limit:
            x = 0
            y += row_height
            row_height = 0
        positions.append((x, y))
        x += image.width
        used_width = max(used_width, x)
        row_height = max(row_height, image.height)
    atlas = Image.new("RGBA", (used_width, y + row_height))
    for frame, position in zip(frames, positions):
        atlas.alpha_composite(frame["image"], position)
    return atlas, positions


def emit_atlases(clips: list[dict], action_id: int, target: Path, url_prefix: str) -> tuple[list[dict], dict]:
    """Pack one action, splitting at clip boundaries if a file exceeds 700 kB."""
    atlases: list[dict] = []
    manifest_clips: dict = {}

    def emit(group: list[dict], suffix: str) -> None:
        frames = [frame for clip in group for frame in clip["frames"]]
        atlas, positions = pack(frames)
        encoded = io.BytesIO()
        atlas.save(encoded, "WEBP", lossless=True, method=4, exact=True)
        data = encoded.getvalue()
        if (len(data) >= MAX_ATLAS_BYTES or atlas.height > 4096) and len(group) > 1:
            half = len(group) // 2
            emit(group[:half], suffix + "a")
            emit(group[half:], suffix + "b")
            return
        if len(data) >= MAX_ATLAS_BYTES or atlas.height > 4096:
            raise ValueError("One clip exceeds atlas limits; importer needs frame-level splitting")
        atlas_id = f"action-{action_id}{suffix}"
        filename = atlas_id + ".webp"
        (target / filename).write_bytes(data)
        url = url_prefix + "/" + filename
        atlases.append({"id": atlas_id, "url": url, "width": atlas.width, "height": atlas.height, "bytes": len(data), "sha256": sha256(data).hexdigest()})
        position_index = 0
        for clip in group:
            output_frames = []
            for frame in clip["frames"]:
                x, y = positions[position_index]
                width, height = frame["image"].size
                output_frames.append({"rect": [x, y, width, height], "durationMs": frame["durationMs"], "pivot": [width / 2, height]})
                position_index += 1
            manifest_clips[f'{action_id}:{clip["directionId"]}'] = {key: clip[key] for key in ("actionId", "directionId", "sourceUrl", "sourceSha256", "sourceBytes", "sourceLoopCount", "loop")}
            manifest_clips[f'{action_id}:{clip["directionId"]}'].update(atlasId=atlas_id, atlasUrl=url, durationMs=sum(frame["durationMs"] for frame in output_frames), frames=output_frames)

    emit(clips, "")
    return atlases, manifest_clips


def verify(output: Path, cache: Path) -> None:
    """Verify every emitted pixel, duration, rectangle and hash against cached GIFs."""
    manifests = sorted(output.glob("role-*/**/manifest.json"))
    if not manifests:
        raise ValueError("No imported character manifests to verify")
    summary = {"version": "molibaike-verification/1", "characters": len(manifests), "clips": 0, "frames": 0, "atlasBytes": 0, "largestAtlasBytes": 0, "failures": [], "pixelComparison": "lossless RGBA after normalizing invisible RGB to zero; original GIF canvas/disposal/durations retained"}
    source_hashes: dict[str, list[str]] = {}
    for path in manifests:
        manifest = json.loads(path.read_text())
        atlases = {}
        for entry in manifest["atlases"]:
            atlas_path = output / entry["url"].split("assets/characters/molibaike/", 1)[1]
            data = atlas_path.read_bytes()
            if len(data) >= MAX_ATLAS_BYTES or sha256(data).hexdigest() != entry["sha256"]:
                raise ValueError(f"Atlas hash/size mismatch: {atlas_path}")
            image = Image.open(io.BytesIO(data)).convert("RGBA")
            if image.size != (entry["width"], entry["height"]):
                raise ValueError(f"Atlas dimensions mismatch: {atlas_path}")
            atlases[entry["id"]] = image
            summary["atlasBytes"] += len(data)
            summary["largestAtlasBytes"] = max(summary["largestAtlasBytes"], len(data))
        for key, clip in manifest["clips"].items():
            filename = clip["sourceUrl"].rsplit("/", 1)[1]
            original = decode_clip({"filename": filename, "sourceUrl": clip["sourceUrl"]}, cache, True)
            source_hashes.setdefault(original["sourceSha256"], []).append(clip["sourceUrl"])
            if original["sourceSha256"] != clip["sourceSha256"] or len(original["frames"]) != len(clip["frames"]):
                raise ValueError(f"Source hash/frame count mismatch: {path} {key}")
            if clip["durationMs"] != sum(frame["durationMs"] for frame in original["frames"]):
                raise ValueError(f"Clip duration mismatch: {path} {key}")
            for index, (source, frame) in enumerate(zip(original["frames"], clip["frames"])):
                x, y, width, height = frame["rect"]
                atlas = atlases[clip["atlasId"]]
                if min(x, y) < 0 or x + width > atlas.width or y + height > atlas.height:
                    raise ValueError(f"Frame rectangle out of bounds: {path} {key}/{index}")
                actual = atlas.crop((x, y, x + width, y + height))
                expected = Image.alpha_composite(Image.new("RGBA", source["image"].size), source["image"])
                if actual.size != expected.size or actual.tobytes() != expected.tobytes():
                    raise ValueError(f"Frame pixels/transparency mismatch: {path} {key}/{index}")
                if frame["durationMs"] != source["durationMs"]:
                    raise ValueError(f"Frame duration mismatch: {path} {key}/{index}")
                summary["frames"] += 1
            summary["clips"] += 1
        summary["failures"].extend(manifest["failures"])
        print(f"Verified {manifest['name']}: {len(manifest['clips'])} clips", flush=True)
    summary["duplicateSourceGroups"] = [urls for urls in source_hashes.values() if len(urls) > 1]
    write_json(output / "verification.json", summary)
    print(json.dumps({key: value for key, value in summary.items() if key != "duplicateSourceGroups"}, ensure_ascii=False), flush=True)
    if summary["failures"]:
        raise SystemExit("Verification found unresolved source clips; see verification.json")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--catalog", type=Path, help="Previously observed website catalog JSON array")
    parser.add_argument("--cache", type=Path, default=Path("/tmp/molibaike"))
    parser.add_argument("--out", type=Path, default=ROOT / "public/assets/characters/molibaike")
    parser.add_argument("--roles", help="Comma-separated observed base IDs; omit for all listed characters")
    parser.add_argument("--actions", help="Comma-separated observed action IDs; omit for all listed actions")
    parser.add_argument("--color", type=int, default=0)
    parser.add_argument("--weapon", type=int, default=2)
    parser.add_argument("--workers", type=int, choices=range(1, 9), default=4)
    parser.add_argument("--rate", type=float, default=4, help="Maximum request starts per second (0 < rate <= 4)")
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--verify", action="store_true", help="Verify emitted files against cached source GIFs; no network")
    args = parser.parse_args()
    if not 0 < args.rate <= 4:
        parser.error("--rate must be greater than zero and at most four")
    global REQUESTS_PER_SECOND
    REQUESTS_PER_SECOND = args.rate
    if args.verify:
        verify(args.out, args.cache)
        return
    roles = json.loads(args.catalog.read_text()) if args.catalog else discover(args.cache, args.offline)
    requested_roles = set(map(int, args.roles.split(","))) if args.roles else None
    requested_actions = set(map(int, args.actions.split(","))) if args.actions else None
    if requested_roles and requested_roles - {role["baseId"] for role in roles}:
        raise ValueError("Requested role is absent from observed catalog")
    args.out.mkdir(parents=True, exist_ok=True)
    catalog_path = ROOT / "src/data/molibaike-catalog.json"
    catalog = {"version": "molibaike-catalog/1", "source": SOURCE + "/Role", "licenseNotice": NOTICE, "selection": {"color": args.color, "weapon": args.weapon, "description": "网站默认：风格一、空手" if args.color == 0 and args.weapon == 2 else "显式选择的风格/武器"}, "directions": [{"id": index, "name": name} for index, name in enumerate(DIRECTIONS)], "actions": roles[0]["actionType"], "characters": []}
    for role in roles:
        character_id = f'role-{role["baseId"]}'
        variant = "" if args.color == 0 and args.weapon == 2 else f"/color-{args.color}-weapon-{args.weapon}"
        prefix = f"assets/characters/molibaike/{character_id}{variant}"
        catalog["characters"].append({**role, "id": character_id, "manifestUrl": prefix + "/manifest.json", "portraitUrl": prefix + "/portrait.webp"})
    variant_suffix = "" if args.color == 0 and args.weapon == 2 else f"-color-{args.color}-weapon-{args.weapon}"
    # Explicit alternative imports must not silently replace the live game's
    # default character catalog or combine variant coverage into its report.
    if not variant_suffix and args.out.resolve() == (ROOT / "public/assets/characters/molibaike").resolve():
        write_json(catalog_path, catalog)
    write_json(args.out / f"source-catalog{variant_suffix}.json", catalog)
    report_path = args.out / f"import-report{variant_suffix}.json"
    old_report = json.loads(report_path.read_text()) if report_path.exists() else {}
    SINGLE_RETRY_URLS.update(failure["sourceUrl"] for failure in old_report.get("failures", []) if "sourceUrl" in failure)
    previous = {role["characterId"]: role for role in old_report.get("characters", [])}
    prior_errors = old_report.get("priorErrors", []) + old_report.get("failures", [])
    prior_errors = list({failure.get("sourceUrl", "") + failure.get("error", ""): failure for failure in prior_errors}.values())
    report = {"version": "molibaike-import-report/1", "selection": catalog["selection"], "catalogCharacters": len(roles), "catalogCandidateCount": sum(role["candidateCount"] for role in roles), "characters": list(previous.values()), "failures": [], "priorErrors": prior_errors}
    hashes: dict[str, list[str]] = {}
    selected_roles = [role for role in roles if not requested_roles or role["baseId"] in requested_roles]
    for role_index, role in enumerate(selected_roles):
        if NETWORK_BLOCKED.is_set():
            report["networkBlocked"] = True
            report["unprocessedCharacters"] = [f'role-{item["baseId"]}' for item in selected_roles[role_index:]]
            write_json(report_path, report)
            break
        started_at = time.monotonic()
        if args.color not in {item["id"] for item in role["roleColor"]} or args.weapon not in {item["id"] for item in role["weaponType"]}:
            raise ValueError(f"Selection absent for {role['name']}")
        actions = [action["id"] for action in role["actionType"] if requested_actions is None or action["id"] in requested_actions]
        if requested_actions and requested_actions - set(actions):
            raise ValueError(f"Requested action absent for {role['name']}")
        sprite_id = role["baseId"] + args.color * 6 + args.weapon
        character = next(item for item in catalog["characters"] if item["baseId"] == role["baseId"])
        prefix = character["manifestUrl"].rsplit("/", 1)[0]
        relative = prefix.removeprefix("assets/characters/molibaike/")
        target = args.out / relative
        target.mkdir(parents=True, exist_ok=True)
        tasks = [{"filename": f"CG{sprite_id}{direction}{action:02d}.gif", "sourceUrl": f"{SOURCE}/Content/Role/CG{sprite_id}{direction}{action:02d}.gif", "actionId": action, "directionId": direction} for action in actions for direction in range(8)]
        clips, failures = [], []
        print(f"Importing {role['name']} ({role['baseId']}), {len(tasks)} clips; character {role_index + 1}/{len(selected_roles)}", flush=True)
        with ThreadPoolExecutor(max_workers=args.workers) as executor:
            pending = {executor.submit(decode_clip, task, args.cache, args.offline): task for task in tasks}
            for future in as_completed(pending):
                task = pending[future]
                try:
                    clip = future.result()
                    clips.append(clip)
                    hashes.setdefault(clip["sourceSha256"], []).append(clip["sourceUrl"])
                except Exception as error:
                    failure = {"characterId": character["id"], **task, "error": str(error), "status": "network-blocked" if isinstance(error, DownloadBlocked) else "failed"}
                    failures.append(failure)
                    if not isinstance(error, DownloadBlocked) or len(failures) <= 3:
                        print(f"  Failed {task['filename']}: {error}", flush=True)
        clips.sort(key=lambda clip: (clip["actionId"], clip["directionId"]))
        old_manifest_path = target / "manifest.json"
        old_manifest = json.loads(old_manifest_path.read_text()) if old_manifest_path.exists() else {}
        retained_clips = {key: value for key, value in old_manifest.get("clips", {}).items() if value["actionId"] not in actions}
        retained_atlas_ids = {clip["atlasId"] for clip in retained_clips.values()}
        retained_failures = [failure for failure in old_manifest.get("failures", []) if failure["actionId"] not in actions]
        manifest = {"version": "molibaike-character/1", "characterId": character["id"], "name": role["name"], "source": role["detailUrl"], "licenseNotice": NOTICE, "colorId": args.color, "weaponId": args.weapon, "pivotPolicy": "source-canvas-bottom-center", "pivotNote": "源站不提供脚底锚点；以完整GIF画布底部中心估算，非原始游戏锚点。每个动作保留完整画布，不逐帧紧裁。", "standHeight": old_manifest.get("standHeight"), "atlases": [atlas for atlas in old_manifest.get("atlases", []) if atlas["id"] in retained_atlas_ids], "clips": retained_clips, "failures": retained_failures + failures}
        standing = next((clip for clip in clips if clip["actionId"] == 0 and clip["directionId"] == 5), None)
        if standing:
            manifest["standHeight"] = standing["height"]
            standing["frames"][0]["image"].save(target / "portrait.webp", "WEBP", lossless=True, exact=True, method=4)
        for action in actions:
            action_clips = [clip for clip in clips if clip["actionId"] == action]
            if not action_clips:
                continue
            atlases, entries = emit_atlases(action_clips, action, target, prefix)
            manifest["atlases"].extend(atlases)
            manifest["clips"].update(entries)
        manifest["availableClips"] = len(manifest["clips"])
        manifest["requestedClips"] = len(manifest["clips"]) + len(manifest["failures"])
        write_json(target / "manifest.json", manifest)
        result = {"characterId": character["id"], "name": role["name"], "requestedClips": manifest["requestedClips"], "availableClips": manifest["availableClips"], "frames": sum(len(clip["frames"]) for clip in manifest["clips"].values()), "atlasBytes": sum(atlas["bytes"] for atlas in manifest["atlases"]), "sourceBytes": sum(clip["sourceBytes"] for clip in manifest["clips"].values()), "elapsedSeconds": round(time.monotonic() - started_at, 2), "failures": manifest["failures"]}
        previous[character["id"]] = result
        report["characters"] = list(previous.values())
        report["failures"] = [failure for item in report["characters"] for failure in item["failures"]]
        report["availableClips"] = sum(item["availableClips"] for item in report["characters"])
        report["requestedClips"] = sum(item["requestedClips"] for item in report["characters"])
        report["duplicateSourceGroupsThisRun"] = [urls for urls in hashes.values() if len(urls) > 1]
        write_json(report_path, report)
        print(f"  {result['availableClips']}/{len(tasks)} clips, {result['frames']} frames, {result['atlasBytes']} atlas bytes, {result['elapsedSeconds']}s; {len(selected_roles) - role_index - 1} characters remaining", flush=True)
    if report["failures"]:
        raise SystemExit(f"Import completed with {len(report['failures'])} unresolved clips; see {report_path}")


if __name__ == "__main__":
    main()
