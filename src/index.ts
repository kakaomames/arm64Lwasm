import binaryen from "binaryen";
import { ArmSystem } from "./system.js";
import { writeFileSync } from "fs";

// 値の変化を監視するための徹底的なログ
function missionLog(type: string, message: string) {
    console.log(`[${type}] [${new Date().toISOString()}] ${message}`);
}

try {
    missionLog("SYSTEM", "超軽量 WE Android Engine (ARM64 JIT VM) 本格駆動テスト開始！");

    // ============================================================================
    // 1. テスト用の生ARM64バイナリ（linux.bin）を組み立てる
    // ============================================================================
    // リトルエンディアン形式の NOP 命令（0xd503201f）を2つ配置
    const arm64Instructions = new Uint8Array([
        0x1f, 0x20, 0x03, 0xd5, // 1つ目の NOP
        0x1f, 0x20, 0x03, 0xd5, // 2つ目の NOP
        0x00, 0x00, 0x00, 0x00  // 終端
    ]);

    writeFileSync("linux.bin", arm64Instructions);
    missionLog("FS", `テスト用ミニマムARM64命令 (linux.bin) を生成しました。サイズ: ${arm64Instructions.byteLength} bytes`);

    // ============================================================================
    // 2. 仮想マシンの起動と値の監視
    // ============================================================================
    // 【修正ポイント】 WebAssembly.Memory の下限突破を防ぐため、十分なサイズ（1024MB）を確保！
    const system = new ArmSystem({
        memory: {
            maxSizeMb: 1024
        },
        linux: {
            image: arm64Instructions.buffer
        }
    });
    missionLog("SYSTEM", "ArmSystem の初期化に成功しました！");

    // CPUの内部構造を暴いてステップ実行を試みる
    const cpu = (system as any).cpu;
    if (cpu) {
        missionLog("CPU", `初期状態プログラムカウンタ (PC): 0x${cpu.pc?.toString(16)}`);
        
        // 実行メソッドの調査とステップ実行の試行
        if (typeof cpu.step === "function") {
            missionLog("CPU", "第1命令を実行します...");
            cpu.step();
            missionLog("CPU_VAL", `値の変化 -> 現在のPC: 0x${cpu.pc?.toString(16)}`);
            
            missionLog("CPU", "第2命令を実行します...");
            cpu.step();
            missionLog("CPU_VAL", `値の変化 -> 現在のPC: 0x${cpu.pc?.toString(16)}`);
        } else if (typeof (system as any).execute === "function") {
            missionLog("SYSTEM", "システム全体の実行ループをキックします。");
            (system as any).execute();
        } else {
            // メソッドが不明な場合はオブジェクトのキーをすべてログに出してハックの手がかりにする
            const cpuKeys = Object.keys(cpu);
            const systemKeys = Object.keys(system);
            missionLog("CPU_INSIGHT", `CPU内部プロパティ: ${JSON.stringify(cpuKeys)}`);
            missionLog("SYS_INSIGHT", `System内部プロパティ: ${JSON.stringify(systemKeys)}`);
        }
    }

} catch (e) {
    missionLog("ERROR", `仮想マシン駆動中にエラーが発生: ${e}`);
    console.error(e);
}

// ============================================================================
// 3. Binaryen による動的Wasmコンパイルコアテスト
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
