/**
 * Dev tool: capture one raw FH6 Data Out packet, decode it with the current
 * offset table, run the plausibility check, and save the raw bytes to
 * test/fixtures/packet.bin for the offset-verification test.
 *
 *   npm run capture
 *
 * Point Forza's Data Out at this machine's IP and the configured UDP port,
 * then drive for a moment so a packet arrives.
 */
import dgram from 'node:dgram';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config';
import { parseFrame, validateFrame } from '../telemetry/forzaParser';

const config = loadConfig();
const fixturePath = path.resolve('test/fixtures/packet.bin');

const socket = dgram.createSocket('udp4');

socket.on('error', (err) => {
  console.error('socket error:', err.message);
  process.exit(1);
});

socket.on('message', (buf, rinfo) => {
  console.log(`\nReceived ${buf.length} bytes from ${rinfo.address}:${rinfo.port}\n`);
  console.log('Hex dump:');
  console.log(buf.toString('hex').replace(/(.{64})/g, '$1\n'));

  try {
    const frame = parseFrame(buf);
    console.log('\nDecoded frame:');
    console.log(JSON.stringify(frame, null, 2));

    const result = validateFrame(frame);
    if (result.ok) {
      console.log('\nVALIDATION OK — values are plausible with the current offset table.');
    } else {
      console.log('\nVALIDATION ISSUES — the offset table is probably wrong:');
      for (const issue of result.issues) console.log(`  - ${issue}`);
    }
  } catch (err) {
    console.error('\nParse failed:', err instanceof Error ? err.message : err);
  }

  fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
  fs.writeFileSync(fixturePath, buf);
  console.log(`\nRaw packet saved to ${fixturePath}`);

  socket.close();
  process.exit(0);
});

socket.bind(config.udpPort, config.udpHost, () => {
  console.log(
    `Listening for one FH6 packet on ${config.udpHost}:${config.udpPort} — start driving...`,
  );
});
