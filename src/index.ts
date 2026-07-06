import binaryen from "binaryen";
import { ArmSystem } from "./system.js";
import { writeFileSync } from "fs";

// カカオマメ隊員指定の徹底的な変化出力ログ
function missionLog(type: string, message: string) {
    console.log(`[${type}] [${new Date().toISOString()}] ${message}`);
}

try {
    missionLog("SYSTEM", "超軽量 WE Android Engine (ARM64 JIT VM) 本格駆動テスト開始！");

    // ============================================================================
    // 1. テスト用の生ARM64バイナリ（linux.binの代わり）を組み立てる
    // ============================================================================
    // ARM64の命令はすべて1つの命令が「4バイト（32bit）」固定長だ！
    // 以下のバイト配列で簡単なプログラムを偽装する：
    // 命令1: d503201f -> NOP (何もしない)
    // 命令2: d503201f -> NOP (何もしない)
    const arm64Instructions = new Uint8Array([
        0x1f, 0x20, 0x03, 0xd5, // 1つ目の NOP (リトルエンディアン形式)
        0x1f, 0x20, 0x03, 0xd5, // 2つ目の NOP
        0x00, 0x00, 0x00, 0x00  // 終端 (または未定義命令で安全に止めるためのダミー)
    ]);

    writeFileSync("linux.bin", arm64Instructions);
    missionLog("FS", `テスト用ミニマムARM64命令 (linux.bin) を生成しました。サイズ: ${arm64Instructions.byteLength} bytes`);

    // ============================================================================
    // 2. 仮想マシンの起動と値の監視
    // ============================================================================
    const system = new ArmSystem({
        memory: {
            maxSizeMb: 16 // テスト用なので軽量に16MB確保
        },
        linux: {
            image: arm64Instructions.buffer
        }
    });
    missionLog("SYSTEM", "ArmSystem の初期化に成功。");

    // CPUインスタンスへのアクセスを試みる (src/cpu.ts の実態を補足)
    const cpu = (system as any).cpu;
    if (cpu) {
        missionLog("CPU", `初期状態プログラムカウンタ (PC): 0x${cpu.pc?.toString(16)}`);
        
        // 1ステップ実行させる（もし実行関数が step() や execute() として公開されている場合）
        if (typeof cpu.step === "function") {
            missionLog("CPU", "第1命令 (NOP) を実行します...");
            cpu.step();
            missionLog("CPU_VAL", `値の変化を検出 -> 現在のPC: 0x${cpu.pc?.toString(16)}`);
            
            missionLog("CPU", "第2命令 (NOP) を実行します...");
            cpu.step();
            missionLog("CPU_VAL", `値の変化を検出 -> 現在のPC: 0x${cpu.pc?.toString(16)}`);
        } else if (typeof system.execute === "function") {
            missionLog("SYSTEM", "システム全体の実行ループをキックします。");
            (system as any).execute();
        } else {
            missionLog("WARN", "CPUの直接ステップ実行メソッドが見つからないため、静的解析モードへ移行します。");
            // cpu の中身にどんなプロパティや関数があるかを一覧にして missionLog に吐き出す！
            const cpuKeys = Object.keys(cpu);
            missionLog("CPU_INSIGHT", `CPU内部の利用可能インターフェース: ${JSON.stringify(cpuKeys)}`);
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
