import binaryen from "binaryen";
import { ArmSystem } from "./system.js";
import { writeFileSync } from "fs";

// 値の変化を出力するための徹底的なカスタムログ
function missionLog(type: string, message: string) {
    console.log(`[${type}] [${new Date().toISOString()}] ${message}`);
}

try {
    missionLog("SYSTEM", "超軽量 WE Android Engine (ARM64 JIT VM) 安定駆動テスト開始！");

    // ============================================================================
    // 1. 本格的なARM64テストバイナリの組み立て
    // ============================================================================
    // 命令1: 0xd503201f -> NOP (何もしない) [アドレス: 2MB + 0]
    // 命令2: 0xd503201f -> NOP (何もしない) [アドレス: 2MB + 4]
    // 命令3: 0x14000000 -> B 0 (現在のアドレスへ無限ループ) [アドレス: 2MB + 8]
    // ※ リトルエンディアン形式でバイト配列化するぞ！
    const arm64Instructions = new Uint8Array([
        0x1f, 0x20, 0x03, 0xd5, // 1: NOP
        0x1f, 0x20, 0x03, 0xd5, // 2: NOP
        0x00, 0x00, 0x00, 0x14  // 3: B . (自分自身へジャンプする無限ループ命令！)
    ]);

    writeFileSync("linux.bin", arm64Instructions);
    missionLog("FS", `無限ループ付きARM64命令 (linux.bin) を生成。サイズ: ${arm64Instructions.byteLength} bytes`);

    // ============================================================================
    // 2. 仮想マシンの起動と内部ハック
    // ============================================================================
    missionLog("SYSTEM", "ArmSystem を起動します。内部コンストラクタで自動的に 2MB 地点から実行されます。");
    
    const system = new ArmSystem({
        memory: {
            maxSizeMb: 1024
        },
        linux: {
            image: arm64Instructions.buffer
        }
    });

    missionLog("SYSTEM", "ArmSystem の初期実行が完了、またはループを維持しています。");

    // 実行完了後にレジスタや内部状態にどんな値が入っているかを一本釣りして missionLog に出す
    const cpu = (system as any).cpu;
    if (cpu) {
        if (cpu.registers) {
            missionLog("CPU_VAL", `最終レジスタ状態: ${JSON.stringify(cpu.registers)}`);
        } else {
            // registersが直接見えない場合はキーを全走査して値の格納先を暴く
            const cpuKeys = Object.keys(cpu);
            missionLog("CPU_INSIGHT", `CPU内部の生存キー一覧: ${JSON.stringify(cpuKeys)}`);
        }
    }

} catch (e) {
    missionLog("ERROR", `仮想マシン駆動中にエラーが発生: ${e}`);
    console.error(e);
}

// ============================================================================
// 3. Binaryen コアテスト（現状維持で通過させる）
// ============================================================================
try {
    missionLog("JIT_TEST", "Binaryen 動的コンパイル検証...");
    var builder = new binaryen.Module();

    builder.addFunction("add", binaryen.createType([ binaryen.i32, binaryen.i32 ]), binaryen.i32, [ binaryen.i32 ],
        builder.block(null, [
            builder.local.set(2,
                builder.i32.add(
                    builder.local.get(0, binaryen.i32),
                    builder.local.get(1, binaryen.i32)
                )
            ),
            builder.return(
                builder.local.get(2, binaryen.i32)
            )
        ])
    );

    builder.addFunctionExport("add", "add");

    const binaryData = builder.emitBinary();
    const buffer = Buffer.from(binaryData.buffer);
    writeFileSync("test.wasm", buffer);
    missionLog("JIT_EXPORT", `test.wasm の生成に成功。バイト数: ${buffer.byteLength}`);

} catch (e) {
    missionLog("ERROR", `Binaryen テストゾーンでエラー: ${e}`);
}
