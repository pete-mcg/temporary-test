
export const downloadFileToBrowser = async (
    container: string,
    blob: string,
    filename: string
): Promise<string | null> => {
    try {
        const response = await fetch("/download_file", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ container, blob }),
        });
        if (!response.ok)
            return "There was an error downloading the file: Server responded with " + response.statusText;
        const data = await response.json();
        const byteArray = new Uint8Array(data.filecontent);


        // Check if the file is a PDF
        const isPdf = filename.toLowerCase().endsWith(".pdf");
        const blobObj = new Blob([byteArray], { type: isPdf ? "application/pdf" : undefined });
        const url = URL.createObjectURL(blobObj);

        // Revoke the object URL after some delay to free up memory
        setTimeout(() => URL.revokeObjectURL(url), 10000);

        if (isPdf) {
            // Open a new tab with pdf file           
            window.open(url, "_blank");
            
        } else {
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
           document.body.removeChild(a);
        }

        return url;
    } catch (error: any) {
        return `There was an error downloading the file: ${error?.message || error}`;
    }
};