import assert from 'node:assert/strict';
import {test} from 'node:test';
import {canWriteFolder} from '../src/presentation/pages/alemdrive/drive-src/utils/folderAccess.js';

const modes = ['my-drive', 'shared', 'all', 'recent', 'favorites', 'trash'];
test('personal root permits creation; aggregate and trash views do not', () => {
    for (const mode of modes) assert.equal(canWriteFolder(mode, 'root'), mode === 'my-drive');
});
test('a folder URL under My Drive cannot grant write access to a viewer or unknown user', () => {
    for (const mode of modes) {
        for (const role of ['owner', 'editor', 'viewer', 'member', 'admin', '', null]) {
            assert.equal(canWriteFolder(mode, 'private-folder', {role}), mode !== 'trash' && ['owner', 'editor'].includes(role), `${mode}/${role}`);
        }
        assert.equal(canWriteFolder(mode, 'private-folder'), false);
    }
});
