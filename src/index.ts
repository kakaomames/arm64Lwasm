import binaryen from "binaryen";
import { ArmSystem } from "./system.js";
import { readFileSync, writeFileSync } from "fs";

// デバッグ・値の変化を出力するためのカスタムログ関数
function missionLog(type: string, message: string) {
    console.log(`[${type}] [${new Date().toISOString()}] ${message}`);
}

try {
    missionLog("SYSTEM", "超軽量 WE Android Engine (ARM64 JIT VM) 起動シーケンス開始！");

    // 1. Linuxイメージ（AOSPベースカーネル等）のロード
    missionLog("FS", "linux.bin の読み込みを試みています...");
    const linuxBuffer = readFileSync("linux.bin").buffer;
    missionLog("FS", `linux.bin のロードに成功。サイズ: ${linuxBuffer.byteLength} bytes`);

    // 2. ARM64 仮想マシンの初期化
    const system = new ArmSystem({
        memory: {
            maxSizeMb: 1024 // 1GB メモリ空間の確保
        },
        linux: {
            image: linuxBuffer
        }
    });
    missionLog("SYSTEM", "ArmSystem のインスタンス化が完了しました。メモリ空間: 1024MB");

    // [ハックポイント] 値が変わったとき、状態が変化したとき、またはJITが走ったときにログを出す仕掛け
    // ※ 内部のフック用API（system.onSyscall や system.cpu 等）が公開されている前提、またはインターセプト用
    if ((system as any).onStateChange) {
        (system as any).onStateChange = (oldState: any, newState: any) => {
            missionLog("VM_STATE", `値が変更されました: ${JSON.stringify(oldState)} -> ${JSON.stringify(newState)}`);
        };
    }

    // 例として、仮想マシンの実行ループ（もし実在するなら system.start() 等）
    missionLog("SYSTEM", "ARM64カーネルの実行を開始します...");
    // (system as any).run(); 

} catch (e) {
    missionLog("ERROR", `起動フェーズで致命的なエラーが発生: ${e}`);
    console.error(e);
}

// ============================================================================
// Wasm動的コンパイル（Binaryen）のテスト検証ゾーン
// ============================================================================
try {
    missionLog("JIT_TEST", "Binaryen による動的Wasm生成テストを開始します。");
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

    // テキスト形式のWasmコード（WAT）をログに出力
    missionLog("JIT_WAT", `生成されたWasmテキスト:\n${builder.emitText()}`);

    const moduleBytes = builder.toBytes();
    writeFileSync("test.wasm", moduleBytes);
    missionLog("JIT_EXPORT", `test.wasm へのバイナリ書き込みが完了しました。バイト数: ${moduleBytes.byteLength}`);

} catch (e) {
    missionLog("ERROR", `Binaryen テストゾーンでエラー: ${e}`);
}
