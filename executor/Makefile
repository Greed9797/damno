# REA Executor — Makefile (Mac arm64)
CC = clang++
CFLAGS = -std=c++17 -Wall -Wextra -Wno-unused-parameter -O2 -DNDEBUG
LDFLAGS = -framework CoreFoundation -lproc
PAYLOAD_LDFLAGS = -framework CoreFoundation -ldl -lpthread

SRC = src
DLL = dll
UI = ui
BUILD = build
INCLUDE = include

.PHONY: all clean injector payload ui

all: injector payload ui
	@echo ""
	@echo "=== BUILD COMPLETE ==="
	@echo "Injector:  $(BUILD)/injector"
	@echo "Payload:   $(BUILD)/payload.dylib"
	@echo "UI:        $(BUILD)/rea_exec"
	@echo "======================"
	@echo ""

$(BUILD):
	mkdir -p $(BUILD) scripts

injector: $(BUILD)
	$(CC) $(CFLAGS) -I$(INCLUDE) $(SRC)/injector.cpp -o $(BUILD)/injector $(LDFLAGS)
	@echo "[+] Injector built"

payload: $(BUILD)
	$(CC) $(CFLAGS) -I$(INCLUDE) -dynamiclib $(DLL)/payload.cpp -o $(BUILD)/payload.dylib $(PAYLOAD_LDFLAGS)
	@echo "[+] Payload built"

ui: $(BUILD)
	$(CC) $(CFLAGS) -I$(INCLUDE) $(UI)/main.cpp -o $(BUILD)/rea_exec $(LDFLAGS)
	@echo "[+] UI built"

clean:
	rm -rf $(BUILD)
