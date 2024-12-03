/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/


/**
 * Holds Inbox' public information
 * 
 * @type {InboxPublicView}
 * 
 * @param {string} inboxId ID of the Inbox
 * @param {number} version version of the Inbox
 * @param {Uint8Array} publicMeta Inbox' public meta data
 * 
 */
export interface InboxPublicView {
    inboxId: string;
    version: number;
    publicMeta: Uint8Array;
};

/**
 * Holds information about Inbox' entry
 * 
 * @type {InboxEntry}
 * 
 * @param {string} entryId ID of the entry
 * @param {string} inboxId ID of the Inbox
 * @param {Uint8Array} data entry data
 * @param {File[]} files list of files attached to the entry
 * @param {string} authorPubKey public key of the author of an entry
 * @param {number} createDate Inbox entry creation timestamp
 * @param {number} statusCode status code of retrival and decryption of the Inbox entry
 */
export interface InboxEntry {
    entryId: string;
    inboxId: string;
    data: Uint8Array;
    files: File[];
    authorPubKey: string;
    createDate: number;
    statusCode: number;
};

/**
 * Holds Inbox files configuration
 * 
 * @type {FilesConfig}
 * 
 * @param {int64_t} minCount minimum numer of files required when sending inbox entry
 * @param {int64_t} maxCount maximum numer of files allowed when sending inbox entry
 * @param {int64_t} maxFileSize maximum file size allowed when sending inbox entry
 * @param {int64_t} maxWholeUploadSize maximum size of all files in total allowed when sending inbox entry
 * 
 */
export interface FilesConfig {
    minCount: number;
    maxCount: number;
    maxFileSize: number;
    maxWholeUploadSize: number;
};

