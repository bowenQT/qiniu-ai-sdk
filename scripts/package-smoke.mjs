import assert from 'node:assert/strict';

async function main() {
    const [root, core, qiniu, node, browser] = await Promise.all([
        import('@bowenqt/qiniu-ai-sdk'),
        import('@bowenqt/qiniu-ai-sdk/core'),
        import('@bowenqt/qiniu-ai-sdk/qiniu'),
        import('@bowenqt/qiniu-ai-sdk/node'),
        import('@bowenqt/qiniu-ai-sdk/browser'),
    ]);

    assert.ok(root.QiniuAI, 'root entry should export QiniuAI');
    assert.ok(root.createAgent, 'root entry should export createAgent');
    assert.ok(!('ResponseAPI' in root), 'root entry must not export ResponseAPI');
    assert.ok(!('auditLogger' in root), 'root entry must not export auditLogger');
    assert.ok(!('KodoCheckpointer' in root), 'root entry must not export KodoCheckpointer');

    assert.ok(core.createAgent, 'core entry should export createAgent');
    assert.ok(!('QiniuAI' in core), 'core entry must not export QiniuAI');
    assert.ok(!('auditLogger' in core), 'core entry must not export auditLogger');

    assert.ok(qiniu.QiniuAI, 'qiniu entry should export QiniuAI');
    assert.ok(qiniu.ResponseAPI, 'qiniu entry should export ResponseAPI');
    assert.ok(!('createAgent' in qiniu), 'qiniu entry must not export createAgent');

    assert.ok(node.createNodeQiniuAI, 'node entry should export createNodeQiniuAI');
    assert.ok(node.auditLogger, 'node entry should export auditLogger');
    assert.ok(node.KodoCheckpointer, 'node entry should export KodoCheckpointer');
    assert.ok(node.MCPHttpTransport, 'node entry should export MCPHttpTransport');

    assert.ok(browser.createAgent, 'browser entry should export createAgent');
    assert.ok(!('createNodeQiniuAI' in browser), 'browser entry must not export createNodeQiniuAI');
    assert.ok(!('MCPHttpTransport' in browser), 'browser entry must not export MCPHttpTransport');

    console.log('package smoke ok');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
