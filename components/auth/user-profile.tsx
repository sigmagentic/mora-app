"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { User, Trash2, Download, Edit, Loader2 } from "lucide-react";
import { uint8ToBase64, base64ToUint8 } from "@/lib/utils";
import { deriveKEK, isPRFSupported } from "@/lib/cryptography";
import { Textarea } from "../ui/textarea";
import {
  AppUser,
  StorageFile,
  GameQuestion,
  GameQuestionAnswer,
} from "@/types/types";
import { PrivateDataGame } from "../PrivateDataGame/PrivateDataGame";

interface UserProfileProps {
  user: AppUser;
  prfKek?: CryptoKey | null;
  onLogout: () => void;
  onSyncAuthStatusViaServer: () => void;
}

let CACHED_VMK: CryptoKey | null = null;
let BYPASS_VMK_UI_CHECKS = false;
let BYPASS_HIDE_TABS = true;

export function UserProfile({
  user,
  prfKek,
  onLogout,
  onSyncAuthStatusViaServer,
}: UserProfileProps) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // vault passwork based KEK creation
  const [vaultMode, setVaultMode] = useState<"create" | "enter">("create");
  const [vaultPassword, setVaultPassword] = useState("");
  const [vaultConfirm, setVaultConfirm] = useState("");
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [vmkInMemory, setVmkInMemory] = useState<boolean>(false);
  const [isDevicePRFSupported, setDeviceIsPRFSupported] =
    useState<boolean>(false);
  const [committingPrfSupportToServer, setCommittingPrfSupportToServer] =
    useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);

    try {
      await fetch("/api/auth/logout", { method: "POST" });

      CACHED_VMK = null;
      setVmkInMemory(false);
      onLogout();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const [selectedPrivateFile, setSelectedPrivateFile] = useState<File | null>(
    null
  ); // private file upload
  const [newSecureNoteSession, setNewSecureNoteSession] = useState<
    string | null
  >(null); // secure note writing session
  const [newSecureNoteFileLabel, setNewSecureNoteFileLabel] = useState<
    string | null
  >(null);
  const [secureNoteEditModeFile, setSecureNoteEditModeFile] =
    useState<StorageFile | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [storedPrivateFiles, setStoredPrivateFiles] = useState<
    Array<StorageFile>
  >([]);
  const [storedSecureNoteFiles, setStoredSecureNoteFiles] = useState<
    Array<StorageFile>
  >([]);
  const [
    storedSecureNoteForPrivateGameFile,
    setStoredSecureNoteForPrivateGameFile,
  ] = useState<StorageFile | null>(null);
  const [fetchingStoredFiles, setFetchingStoredFiles] = useState(false);
  const [inSecureGameMode, setInSecureGameMode] = useState(false);

  useEffect(() => {
    fetchStoredFiles();
    console.log("HERE! 1");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    // console.log("user profile updated:", user);
    console.log("HERE! 2");

    async function checkAsyncThings() {
      if (!user.encryptedVmk || !user.kekSalt || !user.vmkIv) {
        console.log("HERE! 3");
        setVaultMode("create");
      } else {
        console.log("HERE! 4");
        // here the user already has the password so we need them to unwrap the VMK
        // ... BUT, if we have the PRF metadata available, we can automatically unwrap it with the PRK KEK
        if (prfKek && user.prfEncryptedVmk && user.prfVmkIv) {
          console.log("HERE! 5");
          await handleVaultPasswordBasedVmkUnwrapping(true);
        } else {
          console.log("HERE! 6");
          // PR, we ask them to re-enter their vault password
          setVaultMode("enter");
        }
      }

      const isPrfSupported = await isPRFSupported();
      setDeviceIsPRFSupported(isPrfSupported);
    }

    checkAsyncThings();
  }, [user]);

  useEffect(() => {
    // user is in secure game mode, and has already created a secure file log -- so we need to keep the file open and in edit mode
    if (storedSecureNoteForPrivateGameFile && inSecureGameMode) {
      console.log("HERE! 7");
      setSecureNoteEditModeFile(storedSecureNoteForPrivateGameFile);
      decryptAndLoadFileToEdit(storedSecureNoteForPrivateGameFile);
    }
  }, [storedSecureNoteForPrivateGameFile, inSecureGameMode]);

  // THIS IS WHERE the app is actually ready to use!
  useEffect(() => {
    if (vmkInMemory) {
      console.log("HERE! 8");
      setInSecureGameMode(true); // just go into secure game mode! (triggers above event IF the user already setup the vault for game data)
    }
  }, [vmkInMemory]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      setSelectedPrivateFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    }
  };

  // S: ENCRYPTION PIPELINE

  // Step 1: Generate a Vault Master Key (Temp)
  async function generateVMK() {
    return crypto.subtle.generateKey(
      {
        name: "AES-GCM",
        length: 256,
      },
      true, // extractable
      ["encrypt", "decrypt"]
    );
  }

  // Step 2: Encrypt a file in the browser
  /*
    High-level flow
    Read file as ArrayBuffer
    Generate random DEK
    Encrypt file with DEK
    Encrypt DEK with VMK
    Upload encrypted payload
  */
  function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  async function generateDEK() {
    return crypto.subtle.generateKey(
      {
        name: "AES-GCM",
        length: 256,
      },
      true, // extractable (we need to wrap it)
      ["encrypt", "decrypt"]
    );
  }

  async function encryptFileWithDEK(dek: CryptoKey, plaintext: ArrayBuffer) {
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV

    const ciphertext = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
      },
      dek,
      plaintext
    );

    return {
      ciphertext,
      iv,
    };
  }

  async function encryptDEKWithVMK(dek: CryptoKey, vmk: CryptoKey) {
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const rawDEK = await crypto.subtle.exportKey("raw", dek);

    const encryptedDEK = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
      },
      vmk,
      rawDEK
    );

    return {
      encryptedDEK,
      iv,
    };
  }

  // Step 3: Full encryption pipeline (this is the key function)
  async function encryptFileForUpload(
    file: File,
    vmk: CryptoKey,
    fileLabel?: string | null
  ) {
    const plaintext = await readFileAsArrayBuffer(file);

    const dek = await generateDEK();

    const { ciphertext, iv: fileIV } = await encryptFileWithDEK(dek, plaintext);

    const { encryptedDEK, iv: dekIV } = await encryptDEKWithVMK(dek, vmk);

    const metadataToUse: Record<string, any> = {
      filename: file.name,
      mimeType: file.type,
      size: file.size,
    };

    // secure notes can have a label
    if (fileLabel && fileLabel !== "") {
      metadataToUse.fileLabel = fileLabel;
    }

    return {
      encryptedFile: ciphertext,
      fileIV,
      encryptedDEK,
      dekIV,
      metadata: metadataToUse,
    };
  }

  function createMultipartFormData(
    payload: {
      encryptedFile: ArrayBuffer;
      fileIV: Uint8Array;
      encryptedDEK: ArrayBuffer;
      dekIV: Uint8Array;
      metadata: Record<string, any>;
    },
    _newSecureNoteSession: string,
    storageFileId?: string
  ) {
    console.log({
      encryptedFileBytes: payload.encryptedFile.byteLength,
      encryptedDEKBytes: payload.encryptedDEK.byteLength,
      fileIV: payload.fileIV.length,
      dekIV: payload.dekIV.length,
    });

    const encryptedFileB64 = uint8ToBase64(
      new Uint8Array(payload.encryptedFile)
    );
    const fileIVB64 = uint8ToBase64(payload.fileIV);
    const encryptedDEKB64 = uint8ToBase64(new Uint8Array(payload.encryptedDEK));
    const dekIVB64 = uint8ToBase64(payload.dekIV);

    const formData = new FormData();

    formData.append("encrypted_file", encryptedFileB64);
    formData.append("file_iv", fileIVB64);
    formData.append("encrypted_dek", encryptedDEKB64);
    formData.append("dek_iv", dekIVB64);

    formData.append("metadata", JSON.stringify(payload.metadata));

    if (storageFileId) {
      formData.append("storageFileId", storageFileId);
    } else {
      // these are not needed if we are editing storage item (i.e. storageFileId is present)
      // formData.append("userId", userId);

      if (selectedPrivateFile) {
        formData.append("storage_type", "2");
      } else if (
        !inSecureGameMode &&
        _newSecureNoteSession &&
        _newSecureNoteSession !== ""
      ) {
        formData.append("storage_type", "1");
      } else if (
        inSecureGameMode &&
        _newSecureNoteSession &&
        _newSecureNoteSession !== ""
      ) {
        formData.append("storage_type", "3");
      } else {
        throw new Error("No valid storage type detected");
      }
    }

    return formData;
  }

  const encryptAndUpload = async (
    isSecureNote: boolean = false,
    useThisRawNewSecureNoteSessionText?: string
  ) => {
    let _newSecureNoteSession: string | null = newSecureNoteSession;

    // when we are updating the data in the game, the newSecureNoteSession state wont get updated fast enough so we allow for manual content saving
    if (
      useThisRawNewSecureNoteSessionText &&
      useThisRawNewSecureNoteSessionText !== newSecureNoteSession
    ) {
      _newSecureNoteSession = useThisRawNewSecureNoteSessionText;
    }

    if (!isSecureNote && !selectedPrivateFile) {
      alert("No uploaded file detected so cannot save");
      return;
    }

    if (isSecureNote && !_newSecureNoteSession) {
      alert("No secure note data detected so cannot save");
      return;
    }

    if (
      _newSecureNoteSession &&
      (!newSecureNoteFileLabel || newSecureNoteFileLabel === "")
    ) {
      alert("Please enter a label for this secure note.");
      return;
    }

    setIsUploading(true);

    try {
      let selectedFileToSave = null;

      // if it's a secure note, we take the raw text in _newSecureNoteSession and create a Blob file out of it with a text/plain mime type and a random name that is
      // ... user_id + timestamp based
      if (isSecureNote && _newSecureNoteSession) {
        let noteFileName = `${user.id}_${Date.now()}.txt`;

        // in edit mode, so we just reuse the exitsing name as we will be editing the file in db
        if (secureNoteEditModeFile) {
          noteFileName = secureNoteEditModeFile?.metadata?.filename;
        }

        const blob = new Blob([_newSecureNoteSession], { type: "text/plain" });
        selectedFileToSave = new File([blob], noteFileName, {
          type: "text/plain",
        });
      } else {
        selectedFileToSave = selectedPrivateFile;
      }

      if (!CACHED_VMK) {
        alert("Vault Master Key not available in memory.");
        return;
      }

      if (!selectedFileToSave) {
        alert("No file selected for upload.");
        return;
      }

      const encryptedPayload = await encryptFileForUpload(
        selectedFileToSave,
        CACHED_VMK,
        newSecureNoteFileLabel
      );

      let res;

      if (secureNoteEditModeFile) {
        res = await fetch("/api/storage/edit-storage", {
          method: "POST",
          body: createMultipartFormData(
            encryptedPayload,
            _newSecureNoteSession!,
            secureNoteEditModeFile.id
          ),
          credentials: "include", // if you use cookies / sessions
        });
      } else {
        res = await fetch("/api/storage/save-storage", {
          method: "POST",
          body: createMultipartFormData(
            encryptedPayload,
            _newSecureNoteSession!
          ),
          credentials: "include", // if you use cookies / sessions
        });
      }

      const body = await res.json();

      if (!res.ok) {
        console.error("Upload error:", body);
        throw new Error(body?.error || "Upload failed");
      }

      // Refresh stored files list
      await fetchStoredFiles();

      // clear selection sessions
      setSelectedPrivateFile(null);

      // when in secure game mode, the file is kept open to hold data as user plays game
      // ... the use effect above for [storedSecureNoteForPrivateGameFile, inSecureGameMode] loads the new game log into setSecureNoteEditModeFile
      // ... after fetchStoredFiles gets the file
      if (!inSecureGameMode) {
        setNewSecureNoteSession(null);
        setNewSecureNoteFileLabel(null);
        setSecureNoteEditModeFile(null);
      }

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
    } catch (err) {
      console.error("Error preparing file:", err);
    } finally {
      setIsUploading(false);
    }
  };
  // E: ENCRYPTION PIPELINE

  // S: DECRYPTION PIPELINE
  //  Step 2: Decrypt the DEK using the VMK. You already have the VMK in memory (from earlier steps).
  async function decryptDEKWithVMK(
    encryptedDEK: Uint8Array,
    dekIV: Uint8Array,
    vmk: CryptoKey
  ): Promise<CryptoKey> {
    const rawDEK = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: dekIV as any,
      },
      vmk,
      encryptedDEK as any
    );

    return crypto.subtle.importKey("raw", rawDEK, { name: "AES-GCM" }, false, [
      "decrypt",
    ]);
  }

  // Step 3: Decrypt the file with the DEK
  async function decryptFileWithDEK(
    encryptedFile: Uint8Array,
    fileIV: Uint8Array,
    dek: CryptoKey
  ): Promise<ArrayBuffer> {
    return crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fileIV as any,
      },
      dek,
      encryptedFile as any
    );
  }

  // Full client-side decryption pipeline (THIS is the key)
  async function decryptVaultFile(row: any, vmk: CryptoKey): Promise<Blob> {
    const encryptedFile = base64ToUint8(row.encrypted_file);
    const fileIV = base64ToUint8(row.file_iv);
    const encryptedDEK = base64ToUint8(row.encrypted_dek);
    const dekIV = base64ToUint8(row.dek_iv);

    const dek = await decryptDEKWithVMK(encryptedDEK, dekIV, vmk);

    const plaintextBuffer = await decryptFileWithDEK(
      encryptedFile,
      fileIV,
      dek
    );

    return new Blob([plaintextBuffer], {
      type: row.metadata.mimeType || "application/octet-stream",
    });
  }

  async function decryptAndDownloadFile(
    fileRow: any,
    dontDownloadButReturnUrl = false
  ) {
    if (!CACHED_VMK) {
      alert("Vault Master Key not available in memory.");
      return;
    }

    const blob = await decryptVaultFile(fileRow, CACHED_VMK);

    // Download
    const url = URL.createObjectURL(blob);

    if (dontDownloadButReturnUrl) {
      return url;
    }

    const a = document.createElement("a");
    a.href = url;
    a.download = fileRow.metadata.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function decryptAndLoadFileToEdit(fileRow: any) {
    if (!CACHED_VMK) {
      alert("Vault Master Key not available in memory.");
      return;
    }

    const blob = await decryptVaultFile(fileRow, CACHED_VMK);

    // Load into a text editor or other UI element
    const reader = new FileReader();
    reader.onload = () => {
      setNewSecureNoteSession(reader.result as string);
      setNewSecureNoteFileLabel(fileRow.metadata.fileLabel);
      setSelectedPrivateFile(null);
      setSecureNoteEditModeFile(fileRow);
    };
    reader.readAsText(blob);
  }

  const fetchStoredFiles = async () => {
    try {
      setFetchingStoredFiles(true);
      const res = await fetch(`/api/storage/get-storage`);
      // const res = await fetch(
      //   `/api/storage/get-storage?user_id=${encodeURIComponent(user.id)}`
      // );

      const body = await res.json();

      if (!res.ok) {
        console.error("Failed to fetch stored files:", body);
        return;
      }

      // console.log("Fetched stored files:", body.files);

      // Separate private files and secure notes
      const secureNotes = body.files.filter(
        (file: any) => file.storage_type === 1
      );

      const privateFiles = body.files.filter(
        (file: any) => file.storage_type === 2
      );

      const privateGameSecureNote = body.files.find(
        (file: any) => file.storage_type === 3
      );

      setStoredPrivateFiles(privateFiles);
      setStoredSecureNoteFiles(secureNotes);
      setStoredSecureNoteForPrivateGameFile(privateGameSecureNote || null);
    } catch (err) {
      console.error("Error fetching stored files:", err);
    } finally {
      setFetchingStoredFiles(false);
    }
  };

  const handleDeleteFile = async (fileId: string, fileName: string) => {
    if (!window.confirm(`Are you sure you want to delete "${fileName}"?`)) {
      return;
    }

    try {
      const res = await fetch(
        `/api/storage/delete-storage?id=${encodeURIComponent(fileId)}`,
        {
          method: "DELETE",
        }
      );
      // const res = await fetch(
      //   `/api/storage/delete-storage?id=${encodeURIComponent(
      //     fileId
      //   )}&userId=${encodeURIComponent(user.id)}`,
      //   {
      //     method: "DELETE",
      //   }
      // );

      const body = await res.json();
      if (!res.ok) {
        console.error("Delete error:", body);
        alert("Failed to delete file. Please try again.");
        return;
      }

      // Refresh the stored files list
      await fetchStoredFiles();
    } catch (err) {
      console.error("Error deleting file:", err);
      alert("An error occurred while deleting the file.");
    }
  };

  const handleVaultPasswordCreation = async () => {
    setVaultError(null);

    if (!vaultPassword) {
      setVaultError("Please enter a password");
      return;
    }

    if (vaultPassword !== vaultConfirm) {
      setVaultError("Passwords do not match");
      return;
    }

    if (CACHED_VMK) {
      alert("Vault Master Key already exists in memory.");
      return;
    }

    // 1. Generate VMK
    CACHED_VMK = await generateVMK();
    setVmkInMemory(true);

    // 2. Generate salt
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const saltBase64 = uint8ToBase64(salt);

    // 3. Derive KEK
    const kek = await deriveKEK(vaultPassword, saltBase64);

    // 4. Encrypt VMK
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const exportedVMK = await crypto.subtle.exportKey("raw", CACHED_VMK);

    const encryptedVMK = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      kek,
      exportedVMK
    );

    // 5. IF PRF is available, we can also encrypt the VMK with that so both can be used
    // ... note that for PRF, the salt info has been saved in the backend during registration
    let prf_encryptedVMK = null;
    let prf_vmk_iv = null;

    if (prfKek) {
      prf_vmk_iv = crypto.getRandomValues(new Uint8Array(12));

      prf_encryptedVMK = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: prf_vmk_iv },
        prfKek,
        exportedVMK
      );
    }

    // 6. Store in DB
    const formData = new FormData();

    formData.append("kek_salt", saltBase64);
    formData.append(
      "encrypted_vmk",
      uint8ToBase64(new Uint8Array(encryptedVMK))
    );
    formData.append("vmk_iv", uint8ToBase64(iv));
    // formData.append("userId", user.id);

    if (prfKek && prf_encryptedVMK && prf_vmk_iv) {
      formData.append(
        "prf_encrypted_vmk",
        uint8ToBase64(new Uint8Array(prf_encryptedVMK))
      );
      formData.append("prf_vmk_iv", uint8ToBase64(prf_vmk_iv));
    }

    const res = await fetch("/api/user/update-user", {
      method: "POST",
      body: formData,
      credentials: "include", // if you use cookies / sessions
    });

    const body = await res.json();

    if (!res.ok) {
      console.error("Delete error:", body);
      alert("Failed to create vault. Please try again.");
      setVaultError("Failed to create vault. Please try again.");
      return;
    } else {
      alert;
      setVaultMode("enter");
      setVaultError(null);
    }

    setVaultPassword("");
    setVaultConfirm("");
  };

  const handleVaultPasswordBasedVmkUnwrapping = async (
    usePrfBasedUnwrapping?: boolean
  ) => {
    let kek = null;
    let encryptedVMK = null;
    let iv = null;

    if (!usePrfBasedUnwrapping) {
      setVaultError(null);

      if (!vaultPassword) {
        setVaultError("Please enter your vault password");
        return;
      }

      kek = await deriveKEK(vaultPassword, user.kekSalt!);

      encryptedVMK = base64ToUint8(user.encryptedVmk!);
      iv = base64ToUint8(user.vmkIv!);
    } else {
      kek = prfKek!;
      encryptedVMK = base64ToUint8(user.prfEncryptedVmk!);
      iv = base64ToUint8(user.prfVmkIv!);
    }

    try {
      const vmkRaw = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv as any },
        kek,
        encryptedVMK as any
      );

      CACHED_VMK = await crypto.subtle.importKey(
        "raw",
        vmkRaw,
        "AES-GCM",
        true, // extractable
        ["encrypt", "decrypt"]
      );
    } catch (decryptionError) {
      setVaultError("Incorrect vault password. Please try again.");
      return;
    }

    setVmkInMemory(true);

    if (!usePrfBasedUnwrapping) {
      setVaultPassword("");
    }
  };

  const handleCommitLazyPRFSupport = async () => {
    if (!CACHED_VMK || !prfKek) {
      alert("PRF KEK or VMK not available in memory.");
      return;
    }

    try {
      setCommittingPrfSupportToServer(true);

      // 1. Get VMK
      const exportedVMK = await crypto.subtle.exportKey("raw", CACHED_VMK);

      // 2. also encrypt the VMK with that so both can be used
      let prf_encryptedVMK = null;
      let prf_vmk_iv = null;

      prf_vmk_iv = crypto.getRandomValues(new Uint8Array(12));

      prf_encryptedVMK = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: prf_vmk_iv },
        prfKek,
        exportedVMK
      );

      const formData = new FormData();

      // formData.append("userId", user.id);

      formData.append(
        "prf_encrypted_vmk",
        uint8ToBase64(new Uint8Array(prf_encryptedVMK))
      );

      formData.append("prf_vmk_iv", uint8ToBase64(prf_vmk_iv));

      const res = await fetch("/api/user/update-user", {
        method: "POST",
        body: formData,
        credentials: "include", // if you use cookies / sessions
      });

      const body = await res.json();

      if (!res.ok) {
        console.error("Delete error:", body);
        alert("Failed to commit the PRF vault access. Please try again.");
        return;
      } else {
        alert(
          "PRF vault access committed successfully. Next time you login, it will be used for password-less vault access."
        );

        // lets get the latets auth status (which will have the PRF metadata and sync it with the UI)
        onSyncAuthStatusViaServer();
      }
    } catch (error) {
      console.error("Error committing PRF support:", error);
      alert("An error occurred while committing PRF support.");
    } finally {
      setCommittingPrfSupportToServer(false);
    }
  };

  const createNewSecureNote = async (isPrivacyDataGame: boolean = false) => {
    setNewSecureNoteSession("");

    if (isPrivacyDataGame) {
      setInSecureGameMode(true);
      setNewSecureNoteFileLabel("privacy_game_log");
    } else {
      setInSecureGameMode(false);
    }
  };

  // bespoke handlers
  const handlePrivateDataGameAnswerSelection = async (
    question: GameQuestion,
    answer: GameQuestionAnswer,
    answerReasoning?: string
  ) => {
    /*
      questionId: question.id
      question: question.text
      answerId: answer.id
      answer: answer.text
      answeredOnTs: Date.now()
    */

    debugger;

    let saveStr = `questionId: ${question.id}\n`;
    saveStr += `question: ${question.text}\n`;
    saveStr += `answerId: ${answer.id}\n`;
    saveStr += `answer: ${answer.text}\n`;

    if (answerReasoning && answerReasoning.trim() !== "") {
      saveStr += `reasoning: ${answerReasoning.trim()}\n`;
    }

    saveStr += `answeredOnTs: ${Date.now()}\n`;

    saveStr = saveStr + "\n" + newSecureNoteSession;

    console.log(saveStr);

    setNewSecureNoteSession(saveStr);
    await encryptAndUpload(true, saveStr);

    return true;
  };

  return (
    <div className="w-full">
      {vmkInMemory || BYPASS_VMK_UI_CHECKS ? (
        <div className="w-full flex flex-row justify-around space-x-4">
          <Card className="mt-4 border-0 shadow-2xl bg-white/95 backdrop-blur-sm w-full max-w-sm">
            <CardHeader className="text-center pb-4 px-4 sm:px-6">
              <div className="flex flex-col items-center space-y-3 sm:space-y-4">
                <Avatar className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-blue-500 to-purple-600">
                  <AvatarFallback className="text-white text-lg sm:text-xl font-bold">
                    {getInitials(user.displayName || user.username)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <CardTitle className="text-xl sm:text-2xl font-bold text-gray-900">
                    <span className="text-blue-600">{">"}</span>{" "}
                    {user.displayName || user.username}
                  </CardTitle>
                  {user.displayName && (
                    <CardDescription className="text-gray-600">
                      @{user.username}
                    </CardDescription>
                  )}
                </div>
                <Badge
                  variant="secondary"
                  className="bg-green-100 text-green-800 border-green-200 text-xs sm:text-sm"
                >
                  <span className="text-xs mr-1">✓</span>
                  authenticated
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-3 sm:space-y-4 px-4 sm:px-6">
              <div className="space-y-2 sm:space-y-3">
                <div className="flex items-center space-x-3 p-2 sm:p-3 bg-gray-50 rounded-lg">
                  <span className="text-gray-500 text-xs sm:text-sm">$</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-medium text-gray-700">
                      username:
                    </p>
                    <p className="text-xs sm:text-sm text-gray-600 truncate">
                      {user.username}
                    </p>
                  </div>
                </div>

                {user.email && (
                  <div className="flex items-center space-x-3 p-2 sm:p-3 bg-gray-50 rounded-lg">
                    <span className="text-gray-500 text-xs sm:text-sm">@</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm font-medium text-gray-700">
                        email:
                      </p>
                      <p className="text-xs sm:text-sm text-gray-600 truncate">
                        {user.email}
                      </p>
                    </div>
                  </div>
                )}

                {isDevicePRFSupported && (
                  <div className="flex items-center space-x-3 p-2 sm:p-3 bg-gray-50 rounded-lg">
                    <span className="text-gray-500 text-xs sm:text-sm">^</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-xs font-medium text-gray-700">
                        Biometrics-Powered Data Encryption:
                      </p>
                      {/* <p className="text-xs sm:text-sm text-green-600 font-medium">
                        <span>
                          Does your device support this?{" "}
                          {isDevicePRFSupported ? "Yes" : "No"}
                        </span>
                      </p> */}
                      <p className="text-xs sm:text-sm text-green-600 font-medium">
                        {prfKek ? (
                          <>
                            <span className="text-green-600 text-[10px]">
                              ✓ Biometrics vault key generated{" "}
                              {user.prfEncryptedVmk && " and committed!"}
                            </span>

                            {!user.prfEncryptedVmk && (
                              <div className="pt-2">
                                <Button
                                  disabled={committingPrfSupportToServer}
                                  onClick={handleCommitLazyPRFSupport}
                                  variant="outline"
                                  className="text-[10px]"
                                >
                                  {committingPrfSupportToServer
                                    ? "Committing ..."
                                    : "Commit pure-biometrics encryption support"}
                                </Button>
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-red-600 text-[10px]">
                            ✗ Biometrics vault key not yet generated. But your
                            data is still fully encrypted with zero-knowledge
                            privacy using your password, which you will need to
                            enter each time you login. Once a Pure-Biometrics
                            key is added to your account, you dont need to use
                            your password each time to access your data! This
                            key will be generated on your next login{" "}
                            {user.prfEncryptedVmk &&
                              " but committed in the past session!"}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-3 sm:pt-4 border-t">
                <Button
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  variant="outline"
                  className="w-full h-10 sm:h-11 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 text-sm sm:text-base"
                >
                  <span className="text-xs mr-2">$</span>
                  {isLoggingOut ? "logout..." : "logout"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="mt-4 border-0 shadow-2xl bg-white/95 backdrop-blur-sm w-full">
            <CardContent className="px-4 sm:px-6">
              <Tabs defaultValue="privacy-data-game" className="w-full">
                <TabsList
                  className={`grid w-full grid-cols-3 mb-4 sm:mb-6 h-9 sm:h-10 ${
                    BYPASS_HIDE_TABS ? "hidden" : ""
                  } `}
                >
                  <TabsTrigger
                    value="privacy-data-game"
                    className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm"
                  >
                    <span className="text-xs">+</span>
                    Game
                  </TabsTrigger>
                  <TabsTrigger
                    value="secure-notes"
                    className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm"
                  >
                    <span className="text-xs">+</span>
                    Secure Notes
                  </TabsTrigger>
                  <TabsTrigger
                    value="private-images"
                    className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm"
                  >
                    <span className="text-xs">+</span>
                    Private Images
                  </TabsTrigger>
                </TabsList>
                {/* Private Data Game */}
                <TabsContent value="privacy-data-game">
                  <Card className="mt-4">
                    <CardHeader className="px-4 sm:px-6">
                      <div className="flex flex-col">
                        <CardTitle className="text-lg sm:text-xl font-semibold">
                        let's play a game...
                        </CardTitle>
                        <CardDescription className="text-gray-600 text-xs">
                          ... to collect highly valuable &quot;human morality&quot; data on a longitudinal basic, to measure your moral compass over time.
                          All data collected is stored with zero-knowledge privacy
                          guarantees. NO ONE can see your data! ONLY 24 questions asked per day. A new one
                          unlocked each UTC hour.
                        </CardDescription>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-3 sm:space-y-4 px-4 sm:px-6">
                      <div className="space-y-3">
                        {storedSecureNoteForPrivateGameFile === null &&
                          newSecureNoteSession === null && (
                            <div className="flex flex-col items-center justify-between">
                              <Button
                                onClick={() => createNewSecureNote(true)}
                                disabled={isUploading}
                                variant="outline"
                                className="h-10 sm:h-11 text-sm sm:text-base"
                              >
                                Create Private Vault to Start Game
                              </Button>
                              <p className="text-[10px] mt-2 text-center w-[80%]">
                                A secure, privacy-preserving, zero-knowledge
                                data storage vault is used to store your game
                                data. NO ONE but you can access the data inside
                                it.
                              </p>
                            </div>
                          )}

                        {inSecureGameMode && newSecureNoteSession !== null && (
                          <>
                            <div>
                              <PrivateDataGame
                                currentGameSecureNoteStorage={
                                  newSecureNoteSession
                                }
                                onAnswerSelection={
                                  handlePrivateDataGameAnswerSelection
                                }
                              />
                            </div>
                            <div className="p-2 sm:p-3 bg-gray-50 rounded-lg">
                              <Textarea
                                id="private-game-secure-note-textarea"
                                value={newSecureNoteSession}
                                onChange={(e) =>
                                  setNewSecureNoteSession(e.target.value)
                                }
                                required
                                disabled={isUploading}
                                placeholder="Enter secure note here..."
                                className="h-10 sm:h-11 text-xs"
                              />
                            </div>

                            <div>
                              <Input
                                id="secure-note-filename"
                                type="text"
                                value={newSecureNoteFileLabel || ""}
                                placeholder="Enter a label for this note (e.g. Financial Notes 2024)"
                                disabled
                                className="h-10 sm:h-11 text-sm"
                              />
                            </div>

                            <div className="pt-2 flex space-x-2">
                              <Button
                                onClick={() => {
                                  if (
                                    confirm(
                                      `Are you sure you want to abort ${
                                        secureNoteEditModeFile
                                          ? "editing"
                                          : "creating"
                                      } this note?`
                                    ) == true
                                  ) {
                                    setNewSecureNoteSession(null);
                                    setNewSecureNoteFileLabel(null);
                                    setSecureNoteEditModeFile(null);
                                  }
                                }}
                                disabled={isUploading}
                                variant="outline"
                                className={`w-full h-10 sm:h-11 text-sm sm:text-base ${
                                  isUploading
                                    ? "opacity-50 cursor-not-allowed"
                                    : ""
                                }`}
                              >
                                Cancel
                              </Button>
                              <Button
                                onClick={() => {
                                  encryptAndUpload(true);
                                }}
                                disabled={isUploading}
                                variant="outline"
                                className={`w-full h-10 sm:h-11 text-sm sm:text-base border-green-200 text-green-600 hover:bg-green-50 hover:border-green-300 ${
                                  isUploading
                                    ? "opacity-50 cursor-not-allowed"
                                    : ""
                                }`}
                              >
                                {isUploading
                                  ? "Encrypting..."
                                  : "Encrypt and Save"}
                              </Button>
                            </div>
                          </>
                        )}

                        <div>
                          {fetchingStoredFiles && (
                            <div className="flex flex-col items-center space-x-2">
                              <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 mr-2 animate-spin" />
                              <span className="text-xs">
                                Loading stored files...
                              </span>
                            </div>
                          )}
                          {storedSecureNoteForPrivateGameFile && (
                            <div className="pt-4 border-t">
                              <div className="space-y-2">
                                <div
                                  key={storedSecureNoteForPrivateGameFile.id}
                                  className="flex items-center space-x-3 p-2 sm:p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-medium text-gray-500 truncate">
                                      {
                                        storedSecureNoteForPrivateGameFile
                                          ?.metadata?.fileLabel
                                      }
                                    </p>
                                    <p className="text-[10px] font-medium text-gray-900 truncate">
                                      {
                                        storedSecureNoteForPrivateGameFile
                                          ?.metadata?.filename
                                      }
                                    </p>
                                    <div className="flex items-center space-x-2 text-xs text-gray-500">
                                      <span>
                                        {
                                          storedSecureNoteForPrivateGameFile.size
                                        }
                                      </span>
                                      <span>•</span>
                                      <span>
                                        {
                                          storedSecureNoteForPrivateGameFile.created_at
                                        }
                                      </span>
                                    </div>
                                  </div>

                                  <button
                                    onClick={() =>
                                      handleDeleteFile(
                                        storedSecureNoteForPrivateGameFile.id,
                                        storedSecureNoteForPrivateGameFile
                                          ?.metadata?.filename
                                      )
                                    }
                                    className="flex-shrink-0 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                                    title="Delete file"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() =>
                                      decryptAndDownloadFile(
                                        storedSecureNoteForPrivateGameFile
                                      )
                                    }
                                    className="flex-shrink-0 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                                    title="Decrypt & Download file"
                                  >
                                    <Download className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setInSecureGameMode(true);
                                      decryptAndLoadFileToEdit(
                                        storedSecureNoteForPrivateGameFile
                                      );
                                    }}
                                    className={`flex-shrink-0 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition ${
                                      isUploading ||
                                      newSecureNoteSession !== null
                                        ? "opacity-50 cursor-not-allowed"
                                        : ""
                                    }`}
                                    title="Edit Note"
                                    disabled={
                                      isUploading ||
                                      newSecureNoteSession !== null
                                    }
                                  >
                                    <Edit className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Secure Note Storage */}
                <TabsContent value="secure-notes">
                  <Card className="mt-4">
                    <CardHeader className="px-4 sm:px-6">
                      <div className="flex flex-col">
                        <CardTitle className="text-lg sm:text-xl font-semibold">
                          Secure Note Storage
                        </CardTitle>
                        <CardDescription className="text-gray-600 text-xs">
                          Encrypt, upload and store private text notes.
                        </CardDescription>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-3 sm:space-y-4 px-4 sm:px-6">
                      <div className="space-y-3">
                        {newSecureNoteSession === null && (
                          <div className="flex items-center justify-between">
                            <Button
                              onClick={() => createNewSecureNote()}
                              disabled={isUploading}
                              variant="outline"
                              className="w-full h-10 sm:h-11 text-sm sm:text-base"
                            >
                              Create New Note
                            </Button>
                          </div>
                        )}

                        {newSecureNoteSession !== null && (
                          <>
                            <div className="p-2 sm:p-3 bg-gray-50 rounded-lg">
                              <Textarea
                                id="secure-note-textarea"
                                value={newSecureNoteSession}
                                onChange={(e) =>
                                  setNewSecureNoteSession(e.target.value)
                                }
                                required
                                disabled={isUploading}
                                placeholder="Enter secure note here..."
                                className="h-10 sm:h-11 text-sm sm:text-base"
                              />
                            </div>

                            <div>
                              <Input
                                id="secure-note-filename"
                                type="text"
                                value={newSecureNoteFileLabel || ""}
                                onChange={(e) =>
                                  setNewSecureNoteFileLabel(e.target.value)
                                }
                                placeholder="Enter a label for this note (e.g. Financial Notes 2024)"
                                required
                                disabled={isUploading}
                                className="h-10 sm:h-11 text-sm"
                              />
                            </div>

                            <div className="pt-2 flex space-x-2">
                              <Button
                                onClick={() => {
                                  if (
                                    confirm(
                                      `Are you sure you want to abort ${
                                        secureNoteEditModeFile
                                          ? "editing"
                                          : "creating"
                                      } this note?`
                                    ) == true
                                  ) {
                                    setNewSecureNoteSession(null);
                                    setNewSecureNoteFileLabel(null);
                                    setSecureNoteEditModeFile(null);
                                  }
                                }}
                                disabled={isUploading}
                                variant="outline"
                                className={`w-full h-10 sm:h-11 text-sm sm:text-base ${
                                  isUploading
                                    ? "opacity-50 cursor-not-allowed"
                                    : ""
                                }`}
                              >
                                Cancel
                              </Button>
                              <Button
                                onClick={() => {
                                  encryptAndUpload(true);
                                }}
                                disabled={isUploading}
                                variant="outline"
                                className={`w-full h-10 sm:h-11 text-sm sm:text-base border-green-200 text-green-600 hover:bg-green-50 hover:border-green-300 ${
                                  isUploading
                                    ? "opacity-50 cursor-not-allowed"
                                    : ""
                                }`}
                              >
                                {isUploading
                                  ? "Encrypting..."
                                  : "Encrypt and Save"}
                              </Button>
                            </div>
                          </>
                        )}

                        <div>
                          {fetchingStoredFiles && (
                            <div className="flex flex-col items-center space-x-2">
                              <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 mr-2 animate-spin" />
                              <span className="text-xs">
                                Loading stored files...
                              </span>
                            </div>
                          )}
                          {storedSecureNoteFiles.length > 0 && (
                            <div className="pt-4 border-t">
                              <p className="text-xs sm:text-sm font-medium text-gray-700 mb-3">
                                Stored Files ({storedSecureNoteFiles.length})
                              </p>
                              <div className="space-y-2">
                                {storedSecureNoteFiles.map((file) => {
                                  const fileMetadata =
                                    typeof file.metadata === "string"
                                      ? JSON.parse(file.metadata)
                                      : file.metadata;

                                  const formatDate = (dateStr: string) => {
                                    const d = new Date(dateStr);
                                    return d.toLocaleDateString("en-US", {
                                      month: "short",
                                      day: "numeric",
                                      year:
                                        d.getFullYear() !==
                                        new Date().getFullYear()
                                          ? "numeric"
                                          : undefined,
                                    });
                                  };

                                  const formatSize = (
                                    bytes?: number | null
                                  ) => {
                                    if (!bytes) return "—";
                                    if (bytes < 1024) return `${bytes}B`;
                                    if (bytes < 1024 * 1024)
                                      return `${(bytes / 1024).toFixed(1)}KB`;
                                    return `${(bytes / (1024 * 1024)).toFixed(
                                      1
                                    )}MB`;
                                  };

                                  return (
                                    <div
                                      key={file.id}
                                      className="flex items-center space-x-3 p-2 sm:p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
                                    >
                                      <div className="min-w-0 flex-1">
                                        <p className="text-xs font-medium text-gray-500 truncate">
                                          {fileMetadata.fileLabel}
                                        </p>
                                        <p className="text-[10px] font-medium text-gray-900 truncate">
                                          {fileMetadata.filename}
                                        </p>
                                        <div className="flex items-center space-x-2 text-xs text-gray-500">
                                          <span>{formatSize(file.size)}</span>
                                          <span>•</span>
                                          <span>
                                            {formatDate(file.created_at)}
                                          </span>
                                        </div>
                                      </div>

                                      <button
                                        onClick={() =>
                                          handleDeleteFile(
                                            file.id,
                                            fileMetadata.filename
                                          )
                                        }
                                        className="flex-shrink-0 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                                        title="Delete file"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() =>
                                          decryptAndDownloadFile(file)
                                        }
                                        className="flex-shrink-0 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                                        title="Decrypt & Download file"
                                      >
                                        <Download className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() =>
                                          decryptAndLoadFileToEdit(file)
                                        }
                                        className={`flex-shrink-0 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition ${
                                          isUploading ||
                                          newSecureNoteSession !== null
                                            ? "opacity-50 cursor-not-allowed"
                                            : ""
                                        }`}
                                        title="Edit Note"
                                        disabled={
                                          isUploading ||
                                          newSecureNoteSession !== null
                                        }
                                      >
                                        <Edit className="w-4 h-4" />
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Private Image Storage */}
                <TabsContent value="private-images">
                  <Card className="mt-4">
                    <CardHeader className="px-4 sm:px-6">
                      <div className="flex flex-col">
                        <CardTitle className="text-lg sm:text-xl font-semibold">
                          Secure Image Storage
                        </CardTitle>
                        <CardDescription className="text-gray-600 text-xs">
                          Encrypt, upload and store any image.
                        </CardDescription>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-3 sm:space-y-4 px-4 sm:px-6">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs sm:text-sm font-medium text-gray-700">
                            Upload new file
                          </p>
                        </div>

                        <div className="p-2 sm:p-3 bg-gray-50 rounded-lg">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            className="text-xs sm:text-sm"
                          />
                        </div>

                        {previewUrl && (
                          <div className="p-2 sm:p-3 bg-gray-50 rounded-lg">
                            <p className="text-xs sm:text-sm font-medium text-gray-700 mb-2">
                              Preview
                            </p>
                            <div className="w-40 h-40 rounded-md overflow-hidden border">
                              <img
                                src={previewUrl}
                                alt="preview"
                                className="object-cover w-full h-full"
                              />
                            </div>
                            <p className="text-xs text-gray-500 mt-2 truncate">
                              {selectedPrivateFile?.name}
                            </p>
                          </div>
                        )}

                        <div className="pt-2">
                          <Button
                            onClick={() => encryptAndUpload(false)}
                            disabled={!selectedPrivateFile || isUploading}
                            variant="outline"
                            className="w-full h-10 sm:h-11 text-sm sm:text-base"
                          >
                            {isUploading
                              ? "Encrypting..."
                              : "Encrypt and Upload"}
                          </Button>
                        </div>

                        <div>
                          {fetchingStoredFiles && (
                            <div className="flex flex-col items-center space-x-2">
                              <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 mr-2 animate-spin" />
                              <span className="text-xs">
                                Loading stored files...
                              </span>
                            </div>
                          )}
                          {storedPrivateFiles.length > 0 && (
                            <div className="pt-4 border-t">
                              <p className="text-xs sm:text-sm font-medium text-gray-700 mb-3">
                                Stored Files ({storedPrivateFiles.length})
                              </p>
                              <div className="space-y-2">
                                {storedPrivateFiles.map((file) => {
                                  const fileMetadata =
                                    typeof file.metadata === "string"
                                      ? JSON.parse(file.metadata)
                                      : file.metadata;

                                  const formatDate = (dateStr: string) => {
                                    const d = new Date(dateStr);
                                    return d.toLocaleDateString("en-US", {
                                      month: "short",
                                      day: "numeric",
                                      year:
                                        d.getFullYear() !==
                                        new Date().getFullYear()
                                          ? "numeric"
                                          : undefined,
                                    });
                                  };
                                  const formatSize = (
                                    bytes?: number | null
                                  ) => {
                                    if (!bytes) return "—";
                                    if (bytes < 1024) return `${bytes}B`;
                                    if (bytes < 1024 * 1024)
                                      return `${(bytes / 1024).toFixed(1)}KB`;
                                    return `${(bytes / (1024 * 1024)).toFixed(
                                      1
                                    )}MB`;
                                  };

                                  return (
                                    <div
                                      key={file.id}
                                      className="flex items-center space-x-3 p-2 sm:p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
                                    >
                                      {/* <div className="w-10 h-10 flex-shrink-0 rounded border overflow-hidden bg-gray-200">
                          <img
                            src={imgUrl}
                            alt={fileMetadata.filename}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display =
                                "none";
                            }}
                          />
                        </div> */}

                                      <div className="min-w-0 flex-1">
                                        <p className="text-xs sm:text-sm font-medium text-gray-900 truncate">
                                          {fileMetadata.filename}
                                        </p>
                                        <div className="flex items-center space-x-2 text-xs text-gray-500">
                                          <span>{formatSize(file.size)}</span>
                                          <span>•</span>
                                          <span>
                                            {formatDate(file.created_at)}
                                          </span>
                                        </div>
                                      </div>

                                      <button
                                        onClick={() =>
                                          handleDeleteFile(
                                            file.id,
                                            fileMetadata.filename
                                          )
                                        }
                                        className="flex-shrink-0 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                                        title="Delete file"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() =>
                                          decryptAndDownloadFile(file)
                                        }
                                        className="flex-shrink-0 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                                        title="Decrypt & Download file"
                                      >
                                        <Download className="w-4 h-4" />
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="w-full max-w-md mx-auto px-4 sm:px-0">
          <Card className="mt-4 border-0 shadow-2xl bg-white/95 backdrop-blur-sm">
            <CardHeader className="px-4 sm:px-6">
              <div className="flex flex-col">
              
                <CardTitle className="text-xl sm:text-2xl font-bold text-gray-900">
            <span className="text-blue-600">{">"}</span> Master Vault Password
          </CardTitle>
                {vaultMode === "create" && (
                  <CardDescription className="text-gray-600 text-[10px]">
                    ⚠️ You need a master vault password that will help you
                    recover your vault if your biometrics encryption fails on
                    this device OR if you need to access or backup your vault on
                    another device. It&apos;s critical you pick somethign strong
                    and secure for this password and make sure you back it up
                    offline for safety!
                  </CardDescription>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-3 sm:space-y-4 px-4 sm:px-6">
              {vaultMode === "create" ? (
                <div className="space-y-3">
                  <div className="p-2 sm:p-3 bg-gray-50 rounded-lg space-y-2">
                    <Input
                      type="password"
                      placeholder="Password"
                      value={vaultPassword}
                      onChange={(e) => setVaultPassword(e.target.value)}
                      className="text-sm"
                    />
                    <Input
                      type="password"
                      placeholder="Confirm password"
                      value={vaultConfirm}
                      onChange={(e) => setVaultConfirm(e.target.value)}
                      className="text-sm"
                    />
                    {vaultError && (
                      <p className="text-xs text-red-600">{vaultError}</p>
                    )}
                    <div className="pt-2">
                      <Button
                        onClick={handleVaultPasswordCreation}
                        variant="outline"
                        className="w-full h-10 sm:h-11 text-sm sm:text-base"
                      >
                        Create Vault Password
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs sm:text-sm font-medium text-gray-700">
                    Enter Master Vault Password
                  </p>
                  <div className="p-2 sm:p-3 bg-gray-50 rounded-lg space-y-2">
                    <Input
                      type="password"
                      placeholder="Vault password"
                      value={vaultPassword}
                      onChange={(e) => setVaultPassword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && vaultPassword.length > 4) {
                          handleVaultPasswordBasedVmkUnwrapping(false);
                        }
                      }}
                      className="text-sm"
                    />
                    {vaultError && (
                      <p className="text-xs text-red-600">{vaultError}</p>
                    )}
                    <div className="pt-2 space-y-2">
                      <Button
                        onClick={() =>
                          handleVaultPasswordBasedVmkUnwrapping(false)
                        }
                        variant="outline"
                        className="w-full h-10 sm:h-11 text-sm sm:text-base"
                      >
                        Enter Vault
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              <div className="pt-3 sm:pt-4 border-t">
                <Button
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  variant="outline"
                  className="w-full h-10 sm:h-11 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 text-sm sm:text-base"
                >
                  <span className="text-xs mr-2">$</span>
                  {isLoggingOut ? "logout..." : "logout"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
