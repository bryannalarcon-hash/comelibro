#!/usr/bin/env python3
"""Create Comelibro's one exact IONOS CNAME and write a private audit receipt."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import urllib.error
import urllib.parse
import urllib.request

DOMAIN = "bryannalarcon.com"
NAME = "comelibro.bryannalarcon.com"
TARGET = "bryannalarcon.com"
API = "https://api.hosting.ionos.com/dns/v1"
ENV = Path("/home/ubuntu/.env.vps")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RuntimeError("IONOS redirected the request; refusing to forward credentials")


def credentials():
    wanted = {"IONOS_HOSTING_API", "IONOS_DNS_PUBLIC_SECRET"}
    values = {}
    with ENV.open() as source:
        for line in source:
            match = re.match(r"^\s*(?:export\s+)?([A-Z_]+)\s*=\s*(.*?)\s*$", line)
            if match and match[1] in wanted:
                value = shlex.split(match[2], comments=True, posix=True)
                if len(value) != 1 or match[1] in values:
                    raise RuntimeError("Malformed or duplicate IONOS credential")
                values[match[1]] = value[0]
    if set(values) != wanted:
        raise RuntimeError("Required IONOS credentials are missing")
    prefixes = [value for value in values.values() if re.fullmatch(r"[0-9a-fA-F]{20,64}", value)]
    if len(prefixes) != 1:
        raise RuntimeError("Cannot identify the IONOS public credential prefix")
    secret = next(value for value in values.values() if value != prefixes[0])
    if not secret or any(character.isspace() for character in secret):
        raise RuntimeError("Invalid IONOS secret format")
    return prefixes[0] + "." + secret


def request(key, method, path, payload=None):
    if not re.fullmatch(r"/zones(?:/[A-Za-z0-9-]+)?(?:/records)?", path):
        raise RuntimeError("Refusing an unexpected IONOS path")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    req = urllib.request.Request(API + path, method=method,
        data=None if payload is None else json.dumps(payload).encode(),
        headers={"X-API-Key": key, "Content-Type": "application/json"})
    try:
        with opener.open(req, timeout=30) as response:
            body = response.read(2_000_001)
            if len(body) > 2_000_000:
                raise RuntimeError("IONOS response is unexpectedly large")
            return json.loads(body) if body else None
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"IONOS returned HTTP {error.code}; response suppressed") from None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        raise RuntimeError("IONOS connection or response failed; verify state before retrying") from None


def canonical(records):
    return json.dumps(sorted(records, key=lambda item: item.get("id", "")), sort_keys=True, separators=(",", ":"))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--audit", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    key = credentials()
    zones = request(key, "GET", "/zones")
    matches = [zone for zone in zones if zone.get("name", "").rstrip(".").lower() == DOMAIN]
    if len(matches) != 1:
        raise RuntimeError("Expected exactly one bryannalarcon.com zone")
    zone_id = matches[0]["id"]
    zone = request(key, "GET", f"/zones/{zone_id}")
    before = zone["records"]
    conflicts = [record for record in before if record.get("name", "").rstrip(".").lower() == NAME]
    desired = {"name": NAME, "type": "CNAME", "content": TARGET, "ttl": 300, "prio": 0, "disabled": False}
    if conflicts:
        if len(conflicts) == 1 and conflicts[0].get("type") == "CNAME" and conflicts[0].get("content", "").rstrip(".").lower() == TARGET:
            print(json.dumps({"status": "already_present", "record_id": conflicts[0]["id"]}))
            return
        raise RuntimeError("The Comelibro hostname already has a conflicting record")
    if not args.apply:
        print(json.dumps({"status": "dry_run", "record": desired}))
        return
    fd = os.open(args.audit, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    receipt = {"version": 1, "time": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "zone_id": zone_id, "before_sha256": hashlib.sha256(canonical(before).encode()).hexdigest(),
        "before_count": len(before), "record": desired, "status": "request_started"}
    with os.fdopen(fd, "w") as audit:
        def save():
            audit.seek(0); json.dump(receipt, audit, indent=2); audit.write("\n"); audit.truncate(); audit.flush(); os.fsync(audit.fileno())
        save()
        created = request(key, "POST", f"/zones/{zone_id}/records", [desired])
        receipt["record_id"] = created[0]["id"]
        after = request(key, "GET", f"/zones/{zone_id}")["records"]
        target = [record for record in after if record.get("id") == receipt["record_id"]]
        before_by_id, after_by_id = ({record["id"]: record for record in records} for records in (before, after))
        changed = [record_id for record_id in before_by_id.keys() | after_by_id.keys() if before_by_id.get(record_id) != after_by_id.get(record_id)]
        unexpected = [record_id for record_id in changed if record_id != receipt["record_id"] and (before_by_id.get(record_id) or after_by_id[record_id]).get("type") != "SOA"]
        correct = len(target) == 1 and target[0].get("type") == "CNAME" and target[0].get("content", "").rstrip(".").lower() == TARGET
        receipt.update(after_sha256=hashlib.sha256(canonical(after).encode()).hexdigest(), after_count=len(after),
            changed_ids=changed, unexpected_ids=unexpected, status="verified" if correct and not unexpected else "verification_failed")
        save()
    if receipt["status"] != "verified":
        raise RuntimeError("DNS changed but verification failed; inspect the private audit")
    print(json.dumps({"status": "verified", "record_id": receipt["record_id"], "audit": str(Path(args.audit).resolve())}))


if __name__ == "__main__":
    main()
