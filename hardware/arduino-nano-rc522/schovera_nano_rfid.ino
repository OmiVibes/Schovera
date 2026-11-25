
#include <SPI.h>
#include <MFRC522.h>
#include <Wire.h>
#include <hd44780.h>
#include <hd44780ioClass/hd44780_I2Cexp.h>
#include <string.h>

#define SS_PIN 10
#define RST_PIN 9

MFRC522 rfid(SS_PIN, RST_PIN);
hd44780_I2Cexp lcd; // auto-detects common PCF8574/MCP23008 I2C backpacks

const uint8_t LCD_COLUMNS = 16;
const uint8_t LCD_ROWS = 2;
const unsigned long WELCOME_MS = 3000;
const unsigned long SCROLL_MS = 350;
const size_t LCD_NAME_MAX = 64;
const size_t HOST_LINE_MAX = 160;

char lcdName[LCD_NAME_MAX + 1] = {0};
char hostLine[HOST_LINE_MAX + 1] = {0};
size_t hostLineLength = 0;
bool hostLineOverflow = false;
bool lcdReady = false;
bool welcomeActive = false;
unsigned long welcomeUntil = 0;
unsigned long lastScrollAt = 0;
size_t scrollOffset = 0;

String lastUID = "";
unsigned long lastScanTime = 0;
const unsigned long scanCooldown = 2000;

void writePaddedLine(uint8_t row, const char *text) {
  lcd.setCursor(0, row);
  const size_t length = strlen(text);
  for (uint8_t column = 0; column < LCD_COLUMNS; column++) {
    lcd.write(column < length ? text[column] : ' ');
  }
}

void showIdleScreen() {
  if (!lcdReady) return;
  writePaddedLine(0, "SCHOVERA");
  writePaddedLine(1, "TAP YOUR CARD");
}

void renderWelcome() {
  if (!lcdReady || !welcomeActive) return;
  writePaddedLine(0, "WELCOME");
  char window[LCD_COLUMNS + 1];
  const size_t nameLength = strlen(lcdName);
  for (uint8_t i = 0; i < LCD_COLUMNS; i++) {
    const size_t position = scrollOffset + i;
    window[i] = position < nameLength ? lcdName[position] : ' ';
  }
  window[LCD_COLUMNS] = '\0';
  writePaddedLine(1, window);
}

int hexValue(char value) {
  if (value >= '0' && value <= '9') return value - '0';
  if (value >= 'A' && value <= 'F') return value - 'A' + 10;
  if (value >= 'a' && value <= 'f') return value - 'a' + 10;
  return -1;
}

void handleHostLine() {
  const char prefix[] = "SCHOVERA_LCD,1,WELCOME,";
  if (hostLineOverflow || strncmp(hostLine, prefix, sizeof(prefix) - 1) != 0) return;
  const char *encoded = hostLine + sizeof(prefix) - 1;
  const size_t encodedLength = strlen(encoded);
  if (encodedLength < 2 || (encodedLength % 2) != 0 || encodedLength > LCD_NAME_MAX * 2) return;

  const size_t nameLength = encodedLength / 2;
  for (size_t i = 0; i < nameLength; i++) {
    const int high = hexValue(encoded[i * 2]);
    const int low = hexValue(encoded[(i * 2) + 1]);
    if (high < 0 || low < 0) return;
    const uint8_t decoded = (uint8_t)((high << 4) | low);
    // LCD ROMs are not UTF-8 displays. Host encodes a reviewed ASCII-safe name;
    // reject control bytes rather than allowing line/control injection.
    if (decoded < 0x20 || decoded > 0x7e) return;
    lcdName[i] = (char)decoded;
  }
  lcdName[nameLength] = '\0';
  if (!nameLength) return;
  welcomeActive = true;
  welcomeUntil = millis() + WELCOME_MS;
  lastScrollAt = millis();
  scrollOffset = 0;
  renderWelcome();
  Serial.println("SCHOVERA_LCD_SHOWN,1");
}

void receiveHostCommands() {
  while (Serial.available() > 0) {
    const char value = (char)Serial.read();
    if (value == '\n') {
      if (hostLineLength && hostLine[hostLineLength - 1] == '\r') hostLine[--hostLineLength] = '\0';
      hostLine[hostLineLength] = '\0';
      handleHostLine();
      hostLineLength = 0;
      hostLineOverflow = false;
      continue;
    }
    if (value == '\r') continue;
    if (hostLineLength >= HOST_LINE_MAX) {
      hostLineOverflow = true;
      continue;
    }
    hostLine[hostLineLength++] = value;
    hostLine[hostLineLength] = '\0';
  }
}

void updateWelcomeScreen() {
  if (!welcomeActive) return;
  const unsigned long now = millis();
  if ((long)(now - welcomeUntil) >= 0) {
    welcomeActive = false;
    showIdleScreen();
    return;
  }
  const size_t nameLength = strlen(lcdName);
  if (nameLength > LCD_COLUMNS && now - lastScrollAt >= SCROLL_MS) {
    lastScrollAt = now;
    scrollOffset = (scrollOffset + 1) % (nameLength + 3);
    if (scrollOffset > nameLength) scrollOffset = 0;
    renderWelcome();
  }
}

void setup() {
  Serial.begin(115200);
  SPI.begin();
  rfid.PCD_Init();
  const int lcdStatus = lcd.begin(LCD_COLUMNS, LCD_ROWS);
  if (lcdStatus == 0) {
    lcdReady = true;
    showIdleScreen();
  } else {
    Serial.println("SCHOVERA_LCD_UNAVAILABLE");
  }

  delay(100);

  Serial.println("SCHOVERA_RFID_READY");
  rfid.PCD_DumpVersionToSerial();
}

void loop() {
  receiveHostCommands();
  updateWelcomeScreen();
  if (!rfid.PICC_IsNewCardPresent()) return;
  if (!rfid.PICC_ReadCardSerial()) return;

  String uid = "";

  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) {
      uid += "0";
    }

    uid += String(rfid.uid.uidByte[i], HEX);

    if (i < rfid.uid.size - 1) {
      uid += ":";
    }
  }

  uid.toUpperCase();

  unsigned long currentTime = millis();

  if (uid != lastUID ||
      currentTime - lastScanTime >= scanCooldown) {

    Serial.print("SCHOVERA_SCAN,");
    Serial.print(uid);
    Serial.print(",");
    Serial.println(currentTime);

    lastUID = uid;
    lastScanTime = currentTime;
  }

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();

  delay(100);
}
