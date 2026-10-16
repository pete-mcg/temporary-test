// Function for securely generating Azure Blob Storage SAS URLs.
// Requests a temporary, read-only SAS URL for a given blob in a specified container by calling the backend endpoint `/generate_sas_url`.
// Logic is within this shared utility file for reusability across app components.

export const getSasUrl = async (container: string, blob: string): Promise<string | null> => {
    try {
        const response = await fetch("/generate_sas_url", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ container, blob }),
        });
        if (!response.ok) return null;
        const data = await response.json();
        return data.sas_url;
    } catch {
        return null;
    }
};