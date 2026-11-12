"""SDK-independent audit of every native platform in a prepared PBW."""
import hashlib
import json
import struct
import uuid
import zipfile

LIMITS = {"emery": 131072, "flint": 65536, "gabbro": 131072}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def crc32(data):
    """STM32 word-order CRC, including the SDK's short-final-word padding."""
    crc = 0xffffffff
    for at in range(0, len(data), 4):
        word = data[at:at + 4]
        crc ^= int.from_bytes(word, "little" if len(word) == 4 else "big")
        for _ in range(32):
            crc = ((crc << 1) ^ (0x04c11db7 if crc & 0x80000000 else 0)) & 0xffffffff
    return crc


def elf_sections(data):
    require(data[:6] == b"\x7fELF\x01\x01", "Expected a little-endian ELF32 image")
    table = struct.unpack_from("<I", data, 32)[0]
    width, count, names_at = struct.unpack_from("<HHH", data, 46)
    require(width == 40 and names_at < count and table + count * width <= len(data), "Invalid ELF section table")
    sections = [struct.unpack_from("<10I", data, table + i * width) for i in range(count)]
    names = sections[names_at]
    require(names[4] + names[5] <= len(data), "Truncated ELF section names")
    strings = data[names[4]:names[4] + names[5]]
    result = []
    for row in sections:
        if not row[2] & 2 or not row[5]:
            continue
        require(row[0] < len(strings) and b"\0" in strings[row[0]:], "Invalid ELF section name")
        name = strings[row[0]:strings.index(0, row[0])].decode("ascii")
        require(row[1] == 8 or row[4] + row[5] <= len(data), "Truncated ELF section")
        result.append((name, row))
    return result


def audit_platforms(root, path):
    package = json.loads((root / "package.json").read_text())
    require(path.stat().st_size <= 4_400_000, "PBW exceeds the Store upload limit")
    report = {}
    with zipfile.ZipFile(path) as archive:
        require(archive.testzip() is None and len(archive.namelist()) == len(set(archive.namelist())), "Damaged or duplicate PBW entries")
        info = json.loads(archive.read("appinfo.json"))
        targets = package["pebble"]["targetPlatforms"]
        require(info["targetPlatforms"] == targets and set(targets) <= LIMITS.keys(), "Unexpected platform declaration")
        require(info["uuid"] == package["pebble"]["uuid"] and info["versionLabel"] == package["version"], "PBW identity differs")
        binaries = {name.split("/")[0] for name in archive.namelist() if name.endswith("/pebble-app.bin")}
        require(binaries == set(targets), "Missing or undeclared native binary")
        for platform in targets:
            prefix = platform + "/"
            binary = archive.read(prefix + "pebble-app.bin")
            resources = archive.read(prefix + "app_resources.pbpack")
            manifest = json.loads(archive.read(prefix + "manifest.json"))
            require(len(binary) >= 132 and binary[:8] == b"PBLAPP\0\0", "Invalid native header")
            require(binary[8:10] >= b"\x10\x01", "Expected the SDK 4.44 wide native header")
            loaded = struct.unpack_from("<H", binary, 14)[0] | binary[130] << 16
            virtual = struct.unpack_from("<H", binary, 128)[0] | binary[131] << 16
            relocations = struct.unpack_from("<I", binary, 100)[0]
            require(binary[104:120] == uuid.UUID(info["uuid"]).bytes, "Native UUID differs")
            require(132 <= loaded <= virtual < LIMITS[platform] and len(binary) <= LIMITS[platform], "Native platform memory/file limit exceeded")
            require(len(binary) == loaded + relocations * 4, "Relocation table length differs")
            checksum = crc32(binary[130:loaded])
            require(checksum == struct.unpack_from("<I", binary, 20)[0], "Native image checksum differs")
            require(manifest["application"]["crc"] == crc32(binary), "Native bundle checksum differs")
            require(manifest["application"]["size"] == len(binary), "Native manifest size differs")
            require(4108 <= len(resources) <= 262144, "Resource pack exceeds Store limits or is truncated")
            count, resource_crc = struct.unpack_from("<II", resources)
            require(count <= 256 and resource_crc == crc32(resources[4108:]), "Resource content checksum differs")
            require(resource_crc == struct.unpack_from("<I", binary, 120)[0], "Native/resource binding differs")
            require(manifest["resources"]["crc"] == crc32(resources), "Resource bundle checksum differs")
            require(manifest["resources"]["size"] == len(resources), "Resource manifest size differs")
            for i in range(count):
                resource_id, offset, length, checksum = struct.unpack_from("<4I", resources, 12 + i * 16)
                require(resource_id == i + 1 and 4108 + offset + length <= len(resources), "Invalid resource directory entry")
                require(crc32(resources[4108 + offset:4108 + offset + length]) == checksum, "Resource entry checksum differs")
            elf = (root / "build" / platform / "pebble-app.elf").read_bytes()
            sections = elf_sections(elf)
            require(max(row[3] + row[5] for _, row in sections) == virtual, "ELF static extent differs")
            require(max(row[3] + row[5] for _, row in sections if row[1] != 8) == loaded, "ELF load extent differs")
            for name, row in sections:
                if row[1] != 8 and name != ".header":
                    require(binary[row[3]:row[3] + row[5]] == elf[row[4]:row[4] + row[5]], "Linked native section differs: " + name)
            report[platform] = {"binaryBytes": len(binary), "loadedBytes": loaded,
                "staticBytes": virtual, "runtimeMemoryBudgetBytes": LIMITS[platform] - virtual,
                "resourceBytes": len(resources), "resources": count,
                "nativeSha256": hashlib.sha256(binary).hexdigest(),
                "resourceSha256": hashlib.sha256(resources).hexdigest()}
    return {"platforms": report, "scope": "Exact SDK/ELF/PBW identity and limits; runtime heap and physical behavior need separate checks"}
