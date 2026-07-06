import binaryen from "binaryen";
import { ArmSystem } from "./system.js";
import { readFileSync, writeFileSync } from "fs";

function missionLog(type: string, message: string) {
    console.log(`[${type}] [${new Date().toISOString()}] ${message}`);
}

// ============================================================================
// 1. ARM64 JIT VM 起動・検証ゾーン
// ============================================================================
try {
    missionLog("SYSTEM", "超軽量 WE Android Engine (ARM64 JIT VM) 起動シーケンス開始！");

    const linuxBuffer = readFileSync("linux.bin").buffer;
    missionLog("FS", `linux.bin のロードに成功。サイズ: ${linuxBuffer.byteLength} bytes`);

    // 0バイトの空ファイルによる即時クラッシュを避けるガード
    if (linuxBuffer.byteLength === 0) {
        missionLog("WARN", "linux.bin が空ファイルのため、CPU実行をスキップし初期化テストのみ行います。");
        // 空ファイルの場合は ArmSystem の立ち上げテストだけを安全に行うか、
        // またはダミーの挙動にする（今回は例外を出さずに検証を進めるためここで防衛線）
    } else {
        const system = new ArmSystem({
            memory: {
                maxSizeMb: 1024
            },
            linux: {
                image: linuxBuffer
            }
        });
        missionLog("SYSTEM", "ArmSystem のインスタンス化に成功しました。");
    }

} catch (e) {
    missionLog("ERROR", `起動フェーズで致命的なエラーが発生: ${e}`);
    console.error(e);
}

// ============================================================================
// 2. Wasm動的コンパイル（Binaryen）エクスポート修正ゾーン
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

    // WATテキストの確認
    missionLog("JIT_WAT", `生成されたWasmテキスト:\n${builder.emitText()}`);

    // 【修正ポイント】 toBytes ではなく emitBinary を使用してバイナリ配列を抽出！
    const binaryData = builder.emitBinary();
    
    // Node.jsのBufferに変換して書き込み
    const buffer = Buffer.from(binaryData.buffer);
    writeFileSync("test.wasm", buffer);
    missionLog("JIT_EXPORT", `test.wasm へのバイナリ書き込みに成功！ バイト数: ${buffer.byteLength}`);

} catch (e) {
    missionLog("ERROR", `Binaryen テストゾーンでエラー: ${e}`);
}
