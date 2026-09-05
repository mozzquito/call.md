<!-- PROJECT SHIELDS -->
[![Electron][electron-shield]][electron-url]
[![Node][node-shield]][node-url]
[![React][react-shield]][react-url]
[![TypeScript][typescript-shield]][typescript-url]
[![License][license-shield]][license-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![Website][website-shield]][website-url]

🇬🇧 [English](README.md) | 🇹🇭 ภาษาไทย (กำลังอ่านอยู่)

<!-- PROJECT LOGO -->
<br />
<p align="center">
  <a href="https://github.com/mozzquito/call.md">
    <img src="resources/wordmark-color-black-bg.png" alt="Call.md Logo" width="300" height="">
  </a>

  <h1 align="center">Call.md</h1>

  <p align="center">
    เปลี่ยนการประชุมให้กลายเป็น live agent loop — บันทึก ถอดเสียง และวิเคราะห์การประชุมด้วย AI แบบเรียลไทม์ ทั้งก่อน ระหว่าง และหลังการประชุม
    <br />
    <a href="https://docs.videodb.io"><strong>ดูเอกสารประกอบ »</strong></a>
    <br />
    <br />
    <a href="#ตัวอย่างการใช้งาน">ดูตัวอย่าง</a>
    ·
    <a href="#ติดตั้งด่วน">ติดตั้ง</a>
    ·
    <a href="https://github.com/mozzquito/call.md/issues">แจ้งบั๊ก</a>
  </p>
</p>

> **นี่คือ personal fork** ดูแลโดย [@mozzquito](https://github.com/mozzquito) ไม่ได้เกี่ยวข้องกับ
> VideoDB แต่อย่างใด เป็นการต่อยอดจากแอปต้นทาง
> ([video-db/call.md](https://github.com/video-db/call.md)) โดยเพิ่มการแปลไทยแบบสด, นำเข้าไฟล์และ
> ถอดเสียงแบบ batch, สรุปความเห็นที่สองจาก AI, และค้นหาข้ามทุกประวัติการประชุม — ดูรายละเอียด
> ที่ [สิ่งที่เพิ่มเข้ามาในฟอร์กนี้](#สิ่งที่เพิ่มเข้ามาในฟอร์กนี้) ด้านล่าง หรืออ่านฉบับเต็มที่
> [`docs/features-th.html`](docs/features-th.html)

---

<a name="ตัวอย่างการใช้งาน"></a>
## ตัวอย่างการใช้งาน


https://github.com/user-attachments/assets/94470e99-c0f6-4e35-9d03-b28efa362b3b



<a name="ติดตั้งด่วน"></a>
## ติดตั้งด่วน

> **หมายเหตุ:** วิธีนี้จะติดตั้ง build อย่างเป็นทางการของต้นทาง (upstream) ซึ่งไม่มีฟีเจอร์ที่เพิ่มเข้ามา
> ในฟอร์กนี้ (แปลไทย, นำเข้าไฟล์, สรุปความเห็นที่สอง, ค้นหา) ถ้าต้องการใช้ฟอร์กนี้ ต้อง build จาก
> source เอง — ดูที่ [เริ่มต้นใช้งาน (สำหรับนักพัฒนา)](#เริ่มต้นใช้งาน-สำหรับนักพัฒนา)

**macOS** (Apple Silicon และ Intel):
```bash
curl -fsSL https://artifacts.videodb.io/call.md/install | bash
```

หลังติดตั้งเสร็จ:
1. เปิด Call.md จาก Applications หรือ Spotlight
2. อนุญาตสิทธิ์การเข้าถึงระบบเมื่อมีการขอ หรือค่อยตั้งค่าทีหลังใน Settings
3. ลงทะเบียนด้วย VideoDB API key ของคุณ ([ขอฟรีได้ที่นี่](https://console.videodb.io))

ต้องอนุญาตสิทธิ์ไมโครโฟนและการบันทึกหน้าจอก่อนเริ่มบันทึกครั้งแรก ส่วน Google Calendar
เป็นตัวเลือกเสริม จะเชื่อมต่อหรือข้ามตอน onboarding ก็ได้

<a name="รองรับแพลตฟอร์มไหนบ้าง"></a>
### รองรับแพลตฟอร์มไหนบ้าง

| แพลตฟอร์ม | ตัวติดตั้ง | สถานะ |
|----------|-----------|--------|
| macOS 12+ (Apple Silicon และ Intel) | คำสั่ง `curl` ด้านบน | รองรับ |
| Windows x64 | Build จาก source ด้วย `npm run dist:win` | รองรับการบันทึก; ยังไม่มีตัวติดตั้งสำเร็จรูป |
| Windows ARM64 | — | ไม่รองรับการบันทึก |
| Linux | Build จาก source ด้วย `npm run dist:linux` | ใช้ฟีเจอร์ต่างๆ ได้; ไม่รองรับการบันทึก |

VideoDB capture SDK ตอนนี้มี recording binary ให้แล้วสำหรับ `darwin-arm64`, `darwin-x64`,
และ `win32-x64` — Call.md จะตรวจสอบว่ามี capture executable และ SQLite native module
อยู่ใน packaged app

การบันทึกบน Windows x64 รองรับผ่าน source build แต่โปรเจกต์นี้ยังไม่มีตัวติดตั้งสำเร็จรูปสำหรับ
Windows ส่วน Linux และ Windows ARM64 สามารถใช้ UI, MCP servers, workflows, ประวัติการประชุม,
การตั้งค่า และ export ได้ครบ แต่แอปจะปฏิเสธการเริ่มบันทึกเพราะไม่มี capture binary ให้
ดูที่ [Build สำหรับแพลตฟอร์มอื่น](#build-สำหรับแพลตฟอร์มอื่น)

---

## ภาพรวม

Call.md เปลี่ยนการประชุมให้กลายเป็น live agent loop บันทึกไว้ในเครื่อง ถอดเสียงแบบเรียลไทม์
(แยกเสียงเราออกจากอีกฝ่าย) และให้ข้อมูลอัจฉริยะระหว่างประชุม เมื่อประชุมจบ จะสร้างสรุปพร้อม
action items และส่งข้อมูลต่อไปยัง workflow automation ที่ตั้งค่าไว้ได้

ฟอร์กนี้ต่อยอดด้วยการแปลไทยแบบสด, นำเข้าไฟล์เก่ามาถอดเสียงแบบ batch, สรุปความเห็นที่สอง
จาก AI, และค้นหาข้ามทุกประวัติการประชุม — ดูที่ [สิ่งที่เพิ่มเข้ามาในฟอร์กนี้](#สิ่งที่เพิ่มเข้ามาในฟอร์กนี้)

## ฟีเจอร์

### ระหว่างประชุม (Live Intelligence)
- **ถอดเสียงแยกช่อง** - แยกถอดเสียงเรา (ไมค์) กับอีกฝ่าย (system audio) โดยใช้ VideoDB
- **ภาษาที่ถอดเสียง** - เลือกภาษาการประชุมได้ที่ **Settings → Transcription** หรือปล่อยเป็น Automatic
- **Live Assist** - AI แนะนำสิ่งที่ควรพูดหรือถามตามบริบทการสนทนา
- **Conversation Metrics** - ติดตามสัดส่วนการพูด, ความเร็วในการพูด (WPM), จำนวนคำถาม, และตรวจจับการพูดคนเดียวยาวๆ แบบเรียลไทม์
- **Coaching Nudges** - แจ้งเตือนเบาๆ (จำกัดความถี่) เมื่อบทสนทนาต้องการการปรับทิศทาง
- **MCP Auto-Triggering** - ตรวจจับความต้องการข้อมูลจากบทสนทนาแล้วเรียกใช้ MCP tools โดยอัตโนมัติ
- **MCP Results Panel** - แสดงผลลัพธ์จากเครื่องมือ (markdown, ลิงก์, structured data) แบบ inline ระหว่างประชุม
- **Bookmarking** - มาร์กช่วงเวลาสำคัญไว้ดูย้อนหลังได้ง่าย

### หลังประชุม
- **สรุปที่สร้างโดย AI** - สร้างออกมา 3 ส่วนพร้อมกัน:
  - สรุปภาพรวม (บรรยายเป็นเรื่องราว)
  - ประเด็นสำคัญแยกตามหัวข้อ (ระบุผู้พูด)
  - Action items (สิ่งที่ต้องทำต่อ ระบุชัดเจน)
- **Export แบบมีโครงสร้าง** - Export เป็น markdown พร้อมบทถอดเสียงเต็ม สรุป และ metrics
- **Workflow Webhooks** - ส่งข้อมูลการประชุมไปยัง n8n, Zapier หรือ CRM อัตโนมัติเมื่อประชุมจบ

### เตรียมตัวก่อนประชุม
- **Meeting Setup Wizard** - AI สร้างคำถามชวนคิดจากรายละเอียดการประชุมที่กรอกไว้
- **Dynamic Checklist** - AI สร้างเช็คลิสต์หัวข้อที่ต้องคุยจากบริบทของการประชุม
- **เชื่อมต่อ Google Calendar** - ซิงก์ตารางประชุมที่จะถึงเข้ามาในแอป

### ความเป็นส่วนตัวและการจัดเก็บข้อมูล
- **จำกัดเวลาบันทึก 2 ชั่วโมง** - การบันทึกจะหยุดเองหลังบันทึกจริงครบ 2 ชั่วโมง พร้อมเตือนล่วงหน้า 5 นาที การหยุดพักหรือเครื่องเข้าโหมดพักไม่นับรวมเวลานี้
- **Local-First** - การตั้งค่า ประวัติการประชุม บทถอดเสียง และข้อมูลที่สร้างขึ้นทั้งหมดเก็บไว้ใน SQLite ในเครื่อง
- **บันทึกหน้าจอและเสียง** - บันทึกหน้าจอ ไมโครโฟน และ system audio พร้อมกันได้
- **ประวัติการประชุม** - ดูและทบทวนการประชุมที่ผ่านมาพร้อมบทถอดเสียงเต็ม รวมถึงค้นหาข้ามทุกการประชุมได้ (ดูที่ [สิ่งที่เพิ่มเข้ามาในฟอร์กนี้](#สิ่งที่เพิ่มเข้ามาในฟอร์กนี้))
- **การเชื่อมต่อ VideoDB** - ฟีเจอร์ถอดเสียงและ AI ต้องใช้อินเทอร์เน็ต
- **ควบคุมบัญชี** - ตรวจสอบและเปลี่ยน VideoDB API key ได้จาก Settings หรือออกจากระบบเพื่อล้าง session และ Google credentials ที่บันทึกไว้

<a name="สิ่งที่เพิ่มเข้ามาในฟอร์กนี้"></a>
### สิ่งที่เพิ่มเข้ามาในฟอร์กนี้

ไม่มีอยู่ในต้นทาง — เพิ่มเข้ามาในฟอร์กนี้เพื่อรองรับการประชุมที่คุยกันเป็นภาษาไทย:

- **แปลไทยแบบสด** - แปลบทถอดเสียงระหว่างประชุมเป็นไทยแบบเรียลไทม์ แสดงเป็นบรรทัดที่สองใต้
  ต้นฉบับแต่ละช่วง เปิดใช้งานได้จาก **Settings → Transcription**
- **นำเข้าไฟล์ + ถอดเสียงแบบ Batch** - นำเข้าไฟล์วิดีโอหรือเสียงที่มีอยู่แล้ว (เช่นไฟล์บันทึก
  Google Meet) แล้วถอดเสียงผ่าน batch pipeline ของ VideoDB ซึ่งรองรับภาษาที่ live streaming
  engine ยังไม่รองรับ รวมถึงภาษาไทยด้วย
- **สรุปความเห็นที่สอง (zcode + agy)** - สร้างสรุปการประชุมอีกชุดจาก AI CLI agent ภายนอกสองตัว
  (zcode บน GLM, agy บน Gemini/Sonnet) ควบคู่ไปกับสรุปหลักของแอป ไว้เปรียบเทียบมุมมอง
- **แปลสรุปท้ายประชุมเป็นไทย** - แปลสรุปสามส่วนสุดท้าย (ภาพรวม, ประเด็นสำคัญ, action items)
  เป็นไทย แล้วเก็บไว้คู่กับต้นฉบับภาษาอังกฤษ
- **ค้นหาข้ามทุกการประชุม** - ค้นชื่อประชุม สรุป และบทถอดเสียงข้ามประวัติการประชุมทั้งหมดได้ในครั้งเดียว
  ด้วย SQLite FTS5 กับ trigram tokenizer (ใช้ได้ทั้งภาษาไทยที่ไม่มีเว้นวรรคระหว่างคำ และภาษาอังกฤษ)
- **นำเข้าไฟล์อย่างรัดกุม (Import Hardening)** - ตรวจ SHA-256 ของไฟล์ก่อนนำเข้าทุกครั้ง ล้างข้อมูลที่อัปโหลดขึ้น VideoDB
  อัตโนมัติหากการนำเข้าล้มเหลว และคัดลอกเช็คลิสต์ action items เป็น markdown ได้ในคลิกเดียว

อ่านรายละเอียดฉบับเต็มภาษาไทยได้ที่ [`docs/features-th.html`](docs/features-th.html)

## วิธีการทำงาน

**ระหว่างบันทึก:**
- บันทึกเสียงแยกช่อง (เราและอีกฝ่าย) แล้วส่งไปยัง VideoDB เพื่อถอดเสียงแบบเรียลไทม์ผ่าน WebSocket
- ประมวลผลข้อมูลอัจฉริยะแบบสด: ติดตาม metrics, ส่ง coaching nudges, และสร้างคำแนะนำด้วย AI
- MCP agent ตรวจจับความต้องการข้อมูลอัตโนมัติแล้วเรียกใช้เครื่องมือที่เกี่ยวข้อง

**หลังบันทึก:**
- สร้างสรุปสามส่วน: ภาพรวมเป็นเรื่องราว, ประเด็นสำคัญ, และ action items
- ส่งข้อมูลการประชุมไปยัง workflow automation (n8n, Zapier, CRM)
- Export เป็น markdown พร้อมบทถอดเสียงเต็มและข้อมูลอัจฉริยะทั้งหมด

## เทคโนโลยีที่ใช้

- **Electron 42** - เฟรมเวิร์กสำหรับแอป desktop
- **TypeScript 5.8** - Type safety เต็มรูปแบบทั้ง main และ renderer process
- **React 19** - เฟรมเวิร์ก UI สมัยใหม่พร้อม concurrent features
- **Tailwind CSS + shadcn/ui** - จัดสไตล์แบบ utility-first พร้อม component คุณภาพสูง
- **tRPC 11** - API layer แบบ type-safe เชื่อม main กับ renderer แบบ end-to-end
- **Hono** - HTTP server เร็วสำหรับ tRPC API endpoints
- **Drizzle ORM + SQLite** - จัดการฐานข้อมูลแบบ type-safe เก็บไว้ในเครื่อง
- **SQLite FTS5 (trigram tokenizer)** - ค้นหาข้ามประวัติการประชุมทั้งหมด รองรับภาษาไทย
- **Zustand** - จัดการ state แบบเบาๆ
- **VideoDB SDK** (0.3.0) - บันทึกหน้าจอ ถอดเสียง และประมวลผลวิดีโอ
- **MCP SDK** (1.0.0) - Model Context Protocol สำหรับเชื่อมต่อเครื่องมือภายนอก
- **OpenAI SDK** (6.19.0) - เรียก LLM ผ่าน API ของ VideoDB ที่รองรับรูปแบบมาตรฐานของ OpenAI
- **zcode / agy** - AI CLI agent ภายนอก เรียกใช้เป็น subprocess สำหรับสรุปความเห็นที่สอง
- **Vite** - Bundle frontend เร็วพร้อม hot module replacement

## สิ่งที่ต้องมีก่อน

- macOS 12+ (Monterey ขึ้นไป) หรือ Windows x64 — จำเป็นสำหรับการบันทึก ดูที่ [รองรับแพลตฟอร์มไหนบ้าง](#รองรับแพลตฟอร์มไหนบ้าง)
- VideoDB API Key ([console.videodb.io](https://console.videodb.io))
- สิทธิ์ระบบ: ไมโครโฟนและการบันทึกหน้าจอ

สำหรับการพัฒนา: Node.js 22.12+ และ npm 10+

## เริ่มต้นใช้งาน (สำหรับผู้ใช้ทั่วไป)

1. **ติดตั้ง:**
   ```bash
   curl -fsSL https://artifacts.videodb.io/call.md/install | bash
   ```

2. **เปิดแอป** และกรอก VideoDB API key ของคุณ ([ขอฟรีได้ที่นี่](https://console.videodb.io))

3. **อนุญาตสิทธิ์** เมื่อมีการขอ หรือค่อยตั้งค่าทีหลังใน Settings

4. **เริ่มบันทึก** - กด "New Meeting" แล้วเริ่ม session แรกของคุณ

แอปจะถอดเสียงแบบเรียลไทม์ แสดง live assist และสร้างสรุปให้เมื่อคุณเสร็จสิ้น

---

<a name="เริ่มต้นใช้งาน-สำหรับนักพัฒนา"></a>
## เริ่มต้นใช้งาน (สำหรับนักพัฒนา)

1. **Clone repository:**
   ```bash
   git clone https://github.com/mozzquito/call.md.git
   cd call-md
   ```

2. **ติดตั้ง dependencies:**
   ```bash
   npm install
   ```

3. **Rebuild native module สำหรับ Electron:**
   ```bash
   npm run rebuild
   ```

4. **เริ่มโหมดพัฒนา:**
   ```bash
   npm run dev
   ```

5. **ลงทะเบียนด้วย VideoDB API key** เมื่อแอปเปิดขึ้นมา

### คำสั่งที่ใช้ได้

| คำสั่ง | คำอธิบาย |
|---------|-------------|
| `npm run dev` | เริ่มโหมดพัฒนา (main + renderer พร้อม hot reload) |
| `npm run build` | Build TypeScript และ React สำหรับ production |
| `npm run dist:mac` | Build DMG สำหรับแจกจ่ายบน macOS |
| `npm run dist:win` | Build ตัวติดตั้ง Windows x64 NSIS พร้อมรองรับการบันทึก |
| `npm run dist:linux` | Build Linux AppImage (ไม่รองรับการบันทึก ดูด้านล่าง) |
| `npm run typecheck` | ตรวจสอบ type ของ TypeScript |
| `npm run test` | รัน unit test |
| `npm run lint` | รัน ESLint |
| `npm run rebuild` | Rebuild native module สำหรับ Electron |
| `npm run db:generate` | สร้างไฟล์ migration ของฐานข้อมูล |
| `npm run db:migrate` | รัน migration ของฐานข้อมูล |

<a name="build-สำหรับแพลตฟอร์มอื่น"></a>
### Build สำหรับแพลตฟอร์มอื่น

electron-builder ตั้งค่าไว้พร้อมแล้วสำหรับ Windows (NSIS) และ Linux (AppImage) จึงสร้าง
ตัวติดตั้งบนแพลตฟอร์มเหล่านั้นได้เลย:

```bash
npm ci
npm run dist:win
```

ควร build และรัน release candidate บน OS เป้าหมายจริง โปรเจกต์นี้ใช้ prebuild ที่เผยแพร่ไว้แล้ว
สำหรับ `better-sqlite3` และ packaged VideoDB capture binary ทำให้เครื่อง macOS สามารถ
cross-package Windows x64 directory build เพื่อตรวจสอบโครงสร้างได้ แต่ไม่ได้แทนที่การทดสอบจริง
บน Windows หรือการเซ็นตัวติดตั้ง เป็นไปตาม
[แนวทาง multi-platform build ของ electron-builder](https://www.electron.build/docs/features/multi-platform-build)
ซึ่งต้องใช้ prebuild เป้าหมายสำหรับ native dependency และยังต้องตรวจสอบบนแพลตฟอร์มเป้าหมายจริงอยู่ดี

การบันทึกรองรับบน macOS arm64/x64 และ Windows x64 ส่วน Linux และ Windows ARM64 ใช้ UI,
MCP servers, workflows, การตั้งค่า, ประวัติ, และ export ได้ครบ แต่การเริ่มบันทึกจะแจ้ง error
ว่าแพลตฟอร์มนี้ไม่รองรับอย่างชัดเจน

Release ที่จะแจกจ่ายต้องเซ็นด้วย credential ของโปรเจกต์ ส่วน macOS ยังต้องผ่าน notarization
และ stapling ด้วย Build ที่ไม่ได้เซ็นในเครื่องอาจได้ Keychain หรือ OS-permission identity
ต่างกันทุกครั้งที่ build ใหม่ จึงไม่สะท้อนพฤติกรรมของ release ที่ติดตั้งจริง

## ตั้งค่า MCP Server

เชื่อมต่อ MCP server ได้ที่ **Settings → MCP Servers**:

1. กด **Add Server**
2. เลือก transport: **stdio** (local) หรือ **http** (remote)
3. ตั้งค่าแล้วกด **Connect**

MCP agent จะทำงานอัตโนมัติระหว่างประชุม ตรวจจับความต้องการข้อมูลจากบทสนทนา แล้วเรียกใช้เครื่องมือ
ที่เกี่ยวข้อง ผลลัพธ์จะแสดงแบบ inline ใน panel **MCP Results**

## การพัฒนา

### โครงสร้างโปรเจกต์

```
src/
├── main/                   # Electron Main Process
│   ├── db/                 # ชั้นฐานข้อมูล (Drizzle + SQLite)
│   ├── ipc/                # IPC handlers
│   ├── lib/                # Utilities (logger, paths, permissions)
│   ├── server/             # HTTP server (Hono + tRPC)
│   │   └── trpc/           # tRPC router และ procedures
│   └── services/           # Business logic
│       ├── copilot/        # Services อัจฉริยะสำหรับการประชุม
│       │   ├── context-manager.service.ts
│       │   ├── conversation-metrics.service.ts
│       │   ├── import.service.ts         # ฟอร์ก: นำเข้าไฟล์ + ถอดเสียงแบบ batch
│       │   ├── nudge-engine.service.ts
│       │   ├── sales-copilot.service.ts  # Orchestrator หลัก
│       │   ├── second-opinion.service.ts # ฟอร์ก: สรุปจาก zcode + agy
│       │   ├── summary-generator.service.ts
│       │   ├── summary-translation.service.ts # ฟอร์ก: แปลสรุปเป็นไทย
│       │   ├── transcript-buffer.service.ts
│       │   └── translation.service.ts    # ฟอร์ก: แปลไทยแบบสด
│       ├── mcp/            # MCP orchestration และการเรียกใช้เครื่องมือ
│       │   ├── connection-orchestrator.service.ts
│       │   ├── intent-detector.service.ts
│       │   ├── mcp-agent.service.ts
│       │   ├── tool-aggregator.service.ts
│       │   └── result-handler.service.ts
│       ├── live-assist.service.ts
│       ├── mcp-inference.service.ts
│       ├── llm.service.ts
│       └── videodb.service.ts
├── preload/                # Preload scripts (สะพานเชื่อม IPC)
├── renderer/               # React Frontend
│   ├── api/                # tRPC client
│   ├── components/         # UI components
│   │   ├── auth/           # Modal ยืนยันตัวตน
│   │   ├── calendar/       # UI เชื่อมต่อปฏิทิน
│   │   ├── copilot/        # UI อัจฉริยะสำหรับการประชุม
│   │   ├── history/        # หน้าประวัติการประชุม
│   │   ├── home/           # หน้าแรก
│   │   ├── icons/          # Icon components
│   │   ├── layout/         # โครงหน้าแอป (sidebar, titlebar)
│   │   ├── mcp/            # Components แสดงสถานะ/ผลลัพธ์ MCP
│   │   ├── meeting-setup/  # Wizard เตรียมการประชุม
│   │   ├── recording/      # ปุ่มควบคุมบันทึก & live assist
│   │   ├── settings/       # หน้าตั้งค่าต่างๆ
│   │   ├── transcription/  # Panel ถอดเสียงสด
│   │   └── ui/             # shadcn/ui components
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utilities
│   └── stores/             # Zustand state stores (session, copilot, mcp)
└── shared/                 # Types & schemas ที่ใช้ร่วมกัน
    ├── schemas/            # Zod validation schemas
    └── types/              # TypeScript types
```

### IPC API

แอปเปิด IPC API ผ่าน preload script:

- `window.electronAPI.mcp.*` - การทำงานเกี่ยวกับ MCP server และเครื่องมือ
- `window.electronAPI.mcpOn.*` - การ subscribe เหตุการณ์ของ MCP

## สิทธิ์การเข้าถึงระบบ

แอปต้องการสิทธิ์ต่อไปนี้ก่อนเริ่มบันทึก:
- **ไมโครโฟน** - สำหรับบันทึกเสียง
- **การบันทึกหน้าจอ** - สำหรับจับภาพหน้าจอ

บน macOS ให้ไปอนุญาตที่ **System Settings → Privacy & Security** — macOS รุ่นใหม่จะเรียกสิทธิ์
บันทึกหน้าจอว่า **Screen & System Audio Recording** ส่วนบน Windows ให้อนุญาตการเข้าถึงไมโครโฟน
สำหรับแอป desktop เมื่อมีการขอ คุณสามารถข้ามการตั้งค่าสิทธิ์ตอน onboarding แล้วย้อนกลับมาตั้งค่า
ทีหลังใน Settings ได้ แต่จะบันทึกไม่ได้จนกว่าจะได้รับสิทธิ์ที่จำเป็นครบ

## แก้ปัญหาเบื้องต้น

**บันทึกไม่ได้:**
- ตรวจสอบสิทธิ์ไมโครโฟนและบันทึกหน้าจอใน System Settings
- ตรวจสอบว่า VideoDB API key ยังใช้งานได้
- ยืนยันว่าแพลตฟอร์มเป็น macOS arm64/x64 หรือ Windows x64

**ไม่มีบทถอดเสียงขึ้นมา:**
- ตรวจสอบว่าเปิดไมค์และ system audio ไว้ในการตั้งค่าแล้ว
- รอ 5-10 วินาทีเพื่อให้บทถอดเสียงแรกขึ้น
- ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต

**การบันทึกหยุดไปเอง:**
- การบันทึกจำกัดไว้ที่ 2 ชั่วโมง แล้วจะหยุดอัตโนมัติเมื่อครบ คุณจะได้รับการแจ้งเตือนของระบบ
  ล่วงหน้า 5 นาที และระบบจะเซฟไฟล์บันทึกพร้อมสรุปผลให้เหมือนกับที่คุณกด Stop เอง
- เวลาที่หยุดพักไว้ไม่นับรวมในลิมิต ดังนั้นจุดตัดจะตรงกับตัวจับเวลาที่แสดงระหว่างประชุม
- เวลาที่เครื่องเข้าโหมดพัก (sleep) ก็ไม่นับรวมเช่นกัน
- หากต้องการเปลี่ยนลิมิต ให้แก้ `MAX_RECORDING_DURATION_MS` ใน
  `src/shared/constants/recording.ts` แล้ว rebuild ใหม่

**ถอดเสียงออกมาผิดภาษา:**
- ตั้งค่าภาษาการประชุมที่ **Settings → Transcription** (มีผลกับการบันทึกครั้งถัดไป
  ไม่ใช่ครั้งที่กำลังบันทึกอยู่)
- หากบทถอดเสียงยังออกมาเป็นภาษาอังกฤษ แปลว่าภาษานั้นยังไม่รองรับโดย backend ถอดเสียงของ
  VideoDB — แอปจะส่ง `language_code` ไปแล้วถ้าไม่รองรับจะ fallback ไปที่ค่าเริ่มต้นของ engine
  แทนที่จะทำให้เกิด error — ดูที่
  [#25](https://github.com/video-db/call.md/issues/25)

**ปัญหาระหว่างพัฒนา:**
- Rebuild native module: `npm run rebuild`
- ตรวจสอบเวอร์ชัน Node.js (ต้อง 22.12+)
- ดู log ที่: `~/Library/Application Support/call-md/logs/`

## การจัดเก็บข้อมูล

ข้อมูลของแอปเก็บไว้ที่:
```
~/Library/Application Support/call-md/
├── config.json             # การตั้งค่าและ desktop access token ที่เข้ารหัสไว้
├── data/
│   └── call-md.db          # ฐานข้อมูล SQLite; แหล่งเดียวที่เก็บ API key แบบเข้ารหัส
├── google_tokens.enc       # Google OAuth token ที่เข้ารหัสไว้ (ถ้าเชื่อมต่อ)
└── logs/
    └── app-YYYY-MM-DD.log  # Log file รายวัน
```

Windows เก็บไฟล์ชุดเดียวกันไว้ในโฟลเดอร์ application-data ของ Electron สำหรับผู้ใช้ปัจจุบัน

## ความปลอดภัย

ฐานข้อมูล การตั้งค่า และ log ของแอปอยู่ในเครื่องคุณเท่านั้น ข้อมูลการบันทึก การถอดเสียง และ
input ที่ส่งให้ AI จะถูกส่งไปยัง VideoDB เมื่อใช้ฟีเจอร์เหล่านั้น หากเปิดใช้ Google Calendar,
MCP server ระยะไกล หรือ workflow webhook ข้อมูลที่เกี่ยวข้องก็จะถูกส่งไปยังบริการที่คุณตั้งค่าไว้ด้วย

- **การเก็บ credential** — แถวผู้ใช้ที่เข้ารหัสไว้ใน SQLite เป็นแหล่งเดียวที่เก็บ VideoDB API key
  ไม่มีสำเนาซ้ำใน `config.json` อีกต่อไป ส่วน desktop access token ใน config ก็เข้ารหัสไว้
  ขณะที่ฐานข้อมูลเก็บแค่ SHA-256 digest ของมัน Google OAuth token ใช้ Electron
  [`safeStorage`](https://www.electronjs.org/docs/latest/api/safe-storage) ส่วนตัวแปรแวดล้อม
  และ HTTP header ของ MCP server เข้ารหัสด้วย AES-256-GCM ภายใต้ key ที่ห่อด้วย keychain
  การเก็บข้อมูลใช้ Keychain บน macOS, DPAPI บน Windows, และ libsecret backend ที่มีความปลอดภัยสูงบน Linux
  การเขียน credential จะล้มเหลวทันที (fail closed) ถ้าไม่มี OS-backed storage ที่ปลอดภัยพอ
  หรือ Linux เลือก backend `basic_text` ที่ไม่ปลอดภัย
- **การเปลี่ยนบัญชี** — API key ใหม่จะถูกตรวจสอบก่อนอัปเดตฐานข้อมูลเพียงจุดเดียว และเปลี่ยนไม่ได้
  ระหว่างกำลังประชุมอยู่ การออกจากระบบทำเสร็จสิ้นใน main process ทั้งหมด: หยุดการบันทึกและ
  กิจกรรมปฏิทิน, ยกเลิก access token ในเครื่อง, ล้าง Google token, และ renderer จะเปลี่ยนสถานะ
  ก็ต่อเมื่อบันทึกข้อมูลสำเร็จแล้วเท่านั้น
- **Local API** — tRPC server bind กับ `127.0.0.1` เท่านั้น และรับ CORS request จาก loopback
  origin เท่านั้น ทำให้ไม่มีอะไรในเครือข่ายเข้าถึงได้ ทุก procedure ยกเว้นการลงทะเบียนต้องใช้
  access token ที่ถูกต้อง
- **สิทธิ์ไฟล์** — โฟลเดอร์ข้อมูลของแอปเป็น `0700` ส่วนฐานข้อมูล, config, token, และ log
  เป็น `0600`
- **Renderer** — ทั้งสองหน้าต่างรันด้วย `contextIsolation`, ไม่มี Node integration, และเปิด
  Chromium sandbox ไว้ API key จะไม่ถูกเขียนลง localStorage เด็ดขาด การตั้งค่าเหล่านี้เป็นไปตาม
  [security checklist ของ Electron](https://www.electronjs.org/docs/latest/tutorial/security)
- **Webhooks** — URL ของ workflow จะถูกตรวจสอบทั้งตอนบันทึกและตอนเรียกใช้จริง scheme ที่ไม่ใช่
  HTTP(S), credential ที่ฝังมาใน URL, redirect, และ host ที่ resolve ไปยัง loopback, private,
  link-local, special-use หรือ cloud-metadata address จะถูกปฏิเสธทั้งหมด IPv4-mapped IPv6
  address จะถูกจัดประเภทตาม IPv4 ปลายทางที่ฝังอยู่ข้างใน การส่งข้อมูลจะ pin ไว้กับ address
  ที่ผ่านการตรวจสอบจาก DNS lookup นั้น ป้องกัน DNS rebinding ระหว่างขั้นตอนตรวจสอบกับตอนเชื่อมต่อจริง
  และจะ timeout ถ้า response ไม่เสร็จภายใน 30 วินาที
- **Logs** — ฟิลด์ที่มีลักษณะเป็น credential จะถูก redact ก่อนเขียนลง log ทุกครั้ง

การอัปเกรดจะย้ายข้อมูลเดิมให้อัตโนมัติตอนเปิดแอปครั้งแรก ไม่ต้อง login ใหม่ หากพบช่องโหว่ด้าน
ความปลอดภัยในแอปต้นทาง ให้แจ้งเป็นการส่วนตัวไปที่
[support@videodb.io](mailto:support@videodb.io) ไม่ควรแจ้งผ่าน public issue ส่วนปัญหาที่เกี่ยวกับ
สิ่งที่เพิ่มเข้ามาในฟอร์กนี้โดยเฉพาะ ให้แจ้งผ่าน
[GitHub Issues](https://github.com/mozzquito/call.md/issues) ของ repo นี้แทน

## ชุมชนและการสนับสนุน

- **เอกสารประกอบ:** [docs.videodb.io](https://docs.videodb.io) (เอกสารของแพลตฟอร์ม VideoDB ต้นทาง)
- **Issues (ฟอร์กนี้):** [GitHub Issues](https://github.com/mozzquito/call.md/issues)
- **Discord:** [เข้าร่วมชุมชน](https://discord.gg/py9P639jGz) (Discord ของชุมชน VideoDB)
- **API Key:** [VideoDB Console](https://console.videodb.io)

---

<p align="center">สร้างด้วย ❤️ โดยทีม <a href="https://videodb.io">VideoDB</a></p>

---

<!-- MARKDOWN LINKS & IMAGES -->
[electron-shield]: https://img.shields.io/badge/Electron-42-47848F?style=for-the-badge&logo=electron&logoColor=white
[electron-url]: https://www.electronjs.org/
[node-shield]: https://img.shields.io/badge/Node.js-22.12+-339933?style=for-the-badge&logo=node.js&logoColor=white
[node-url]: https://nodejs.org/
[react-shield]: https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black
[react-url]: https://reactjs.org/
[typescript-shield]: https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[typescript-url]: https://www.typescriptlang.org/
[license-shield]: https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge
[license-url]: https://opensource.org/licenses/MIT
[stars-shield]: https://img.shields.io/github/stars/mozzquito/call.md.svg?style=for-the-badge
[stars-url]: https://github.com/mozzquito/call.md/stargazers
[issues-shield]: https://img.shields.io/github/issues/mozzquito/call.md.svg?style=for-the-badge
[issues-url]: https://github.com/mozzquito/call.md/issues
[website-shield]: https://img.shields.io/website?url=https%3A%2F%2Fvideodb.io%2F&style=for-the-badge&label=videodb.io
[website-url]: https://videodb.io/
