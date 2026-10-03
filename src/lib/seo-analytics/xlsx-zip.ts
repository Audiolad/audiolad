import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";

export type ZipEntry = {
  name: string;
  data: Buffer;
};

type ZipWriteFile = ZipEntry & {
  method?: 0 | 8;
};

function writeU16(target: Buffer, offset: number, value: number) {
  target.writeUInt16LE(value, offset);
}

function writeU32(target: Buffer, offset: number, value: number) {
  target.writeUInt32LE(value >>> 0, offset);
}

export function zipArchive(files: readonly ZipWriteFile[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const method = file.method ?? 0;
    const stored = method === 8 ? deflateRawSync(file.data) : file.data;
    const checksum = crc32(file.data) >>> 0;
    const local = Buffer.alloc(30);
    writeU32(local, 0, 0x04034b50);
    writeU16(local, 4, 20);
    writeU16(local, 6, 0);
    writeU16(local, 8, method);
    writeU16(local, 10, 0);
    writeU16(local, 12, 0);
    writeU32(local, 14, checksum);
    writeU32(local, 18, stored.length);
    writeU32(local, 22, file.data.length);
    writeU16(local, 26, name.length);
    writeU16(local, 28, 0);
    const localRecord = Buffer.concat([local, name, stored]);
    locals.push(localRecord);

    const central = Buffer.alloc(46);
    writeU32(central, 0, 0x02014b50);
    writeU16(central, 4, 20);
    writeU16(central, 6, 20);
    writeU16(central, 8, 0);
    writeU16(central, 10, method);
    writeU16(central, 12, 0);
    writeU16(central, 14, 0);
    writeU32(central, 16, checksum);
    writeU32(central, 20, stored.length);
    writeU32(central, 24, file.data.length);
    writeU16(central, 28, name.length);
    writeU16(central, 30, 0);
    writeU16(central, 32, 0);
    writeU16(central, 34, 0);
    writeU16(central, 36, 0);
    writeU32(central, 38, 0);
    writeU32(central, 42, offset);
    centrals.push(Buffer.concat([central, name]));
    offset += localRecord.length;
  }

  const centralDirectory = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  writeU32(eocd, 0, 0x06054b50);
  writeU16(eocd, 4, 0);
  writeU16(eocd, 6, 0);
  writeU16(eocd, 8, files.length);
  writeU16(eocd, 10, files.length);
  writeU32(eocd, 12, centralDirectory.length);
  writeU32(eocd, 16, offset);
  writeU16(eocd, 20, 0);
  return Buffer.concat([...locals, centralDirectory, eocd]);
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minimum = Math.max(0, buffer.length - 22 - 0xffff);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("zip_end_not_found");
}

export function unzipArchive(buffer: Buffer): Map<string, Buffer> {
  if (buffer.length < 22) throw new Error("zip_too_small");
  const eocd = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (centralOffset + centralSize > buffer.length) throw new Error("zip_truncated");

  const files = new Map<string, Buffer>();
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error("zip_central_header");
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    cursor += 46 + nameLength + extraLength + commentLength;

    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      throw new Error("zip64_unsupported");
    }
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("zip_local_header");
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length) throw new Error("zip_truncated");
    const compressed = buffer.subarray(dataStart, dataEnd);
    if (method === 0) {
      files.set(name, Buffer.from(compressed));
    } else if (method === 8) {
      files.set(name, inflateRawSync(compressed));
    } else {
      throw new Error("zip_method_unsupported");
    }
  }
  return files;
}
