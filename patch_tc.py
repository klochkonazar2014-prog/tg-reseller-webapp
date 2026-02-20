import codecs

js_files = [r'c:\arenda bot\web\app.js', r'c:\arenda bot\acd_app_utf8.js']

for fp in js_files:
    try:
        with codecs.open(fp, 'r', 'utf-8') as f:
            content = f.read()

        # 1. Add global variable
        if 'let isTcModalMandatory = false;' not in content:
            content = 'let isTcModalMandatory = false;\n' + content

        # 2. Update openTcModal
        old_open = 'function openTcModal(orderId, isPolling = false) {'
        new_open = '''function openTcModal(orderId, isPolling = false, isMandatory = false) {
    isTcModalMandatory = isMandatory;
    const closeBtn = document.getElementById('tc-modal-close-btn');
    if (closeBtn) closeBtn.style.display = isMandatory ? 'none' : 'block';'''
        content = content.replace(old_open, new_open)

        # 3. Update closeTcModal
        old_close = '''function closeTcModal() {
    document.getElementById('tc-modal-overlay').classList.remove('active');'''
        new_close = '''function closeTcModal(force = false) {
    if (isTcModalMandatory && !force) {
        if (typeof tg !== 'undefined' && tg.showAlert) {
            tg.showAlert(t('tut_input_desc') || "Пожалуйста, завершите процесс привязки.");
        }
        return;
    }
    isTcModalMandatory = false;
    document.getElementById('tc-modal-overlay').classList.remove('active');'''
        content = content.replace(old_close, new_close)

        # 4. Update rentBtn logic (if exists)
        content = content.replace('openTcModal(d.order_id, true);', 'openTcModal(d.order_id, true, true);')

        # 5. Update startPollingOrder switch to input mode
        content = content.replace('openTcModal(orderId, false); // Switch to input mode', 'openTcModal(orderId, false, true); // Switch to input mode')

        # 6. Update tutorial next step finish
        old_next = '''} else {
            closeTcModal();
        }'''
        new_next = '''} else {
            closeTcModal(true);
        }'''
        content = content.replace(old_next, new_next)

        with codecs.open(fp, 'w', 'utf-8') as f:
            f.write(content)
        print("Patched " + fp)
    except Exception as e:
        print("Error patching " + fp + ": " + str(e))
