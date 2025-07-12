document.addEventListener('DOMContentLoaded', () => {
    const imageInput = document.getElementById('image-input');
    const analyzeBtn = document.getElementById('analyze-btn');
    const resultsContainer = document.getElementById('results-container');
    const spinner = document.getElementById('spinner');
    let uploadedFile = null;
    analyzeBtn.addEventListener('click', async () => {
        const file = imageInput.files[0];
        if (!file) {
            alert('Please select an image file.');
            return;
        }
    
        uploadedFile = file; // <-- Fix: store for preview
    
        const formData = new FormData();
        formData.append('file', file);
    
        spinner.classList.remove('hidden');
        resultsContainer.innerHTML = '';
    
        try {
            const response = await fetch('/api/analyze-image', {
                method: 'POST',
                body: formData,
            });
    
            const result = await response.json();
    
            if (result.error) {
                resultsContainer.innerHTML = `<p>Error: ${result.error}</p>`;
                if (result.raw_response) {
                    resultsContainer.innerHTML += `<p>Raw Response: <pre>${result.raw_response}</pre></p>`;
                }
            } else {
                displayResults(result);
            }
    
        } catch (error) {
            resultsContainer.innerHTML = `<p>An unexpected error occurred: ${error.message}</p>`;
        } finally {
            spinner.classList.add('hidden');
        }
    });
    

    function displayResults(data) {
        const { bom, total_cost, overlay_url } = data;
    
        let tableHtml = `
            <h2>Bill of Materials</h2>
            <table>
                <thead>
                    <tr>
                        <th>Object</th>
                        <th>Part</th>
                        <th>Material</th>
                        <th>Estimated Cost (USD)</th>
                    </tr>
                </thead>
                <tbody>
        `;
    
        bom.forEach(item => {
            tableHtml += `
                <tr>
                    <td>${item.object}</td>
                    <td>${item.part}</td>
                    <td>${item.material}</td>
                    <td>$${item.cost.toFixed(2)}</td>
                </tr>
            `;
        });
    
        tableHtml += `
                </tbody>
            </table>
            <h3>Total Estimated Cost: $${total_cost.toFixed(2)}</h3>
        `;
    
        // Image section
        const imagePreviewSection = document.getElementById("image-previews");
        const originalImageURL = URL.createObjectURL(uploadedFile);  // created when user uploads
    
        imagePreviewSection.innerHTML = `
            <h3>Visual Breakdown</h3>
            <div class="image-grid">
                <div class="image-column">
                    <h4>Original</h4>
                    <img src="${originalImageURL}" alt="Original" class="preview-img" />
                </div>
                <div class="image-column">
                    <h4>Segmented</h4>
                        <img src="${overlay_url}" alt="Segmented" class="preview-img rotated" />
                </div>
            </div>
        `;
    
        resultsContainer.innerHTML = tableHtml;
    }
    
    function uploadImage() {
        const fileInput = document.getElementById("imageUpload");
        const file = fileInput.files[0];
        if (!file) return;
    
        uploadedFile = file;  // store for preview
    
        const formData = new FormData();
        formData.append("file", file);
    
        loader.style.display = "block";
        resultsContainer.innerHTML = "";
        document.getElementById("image-previews").innerHTML = "";
    
        fetch("/api/analyze-image", {
            method: "POST",
            body: formData
        })
            .then(response => response.json())
            .then(data => displayResults(data))
            .catch(error => {
                console.error("Error:", error);
                resultsContainer.innerHTML = "<p>An error occurred.</p>";
            })
            .finally(() => {
                loader.style.display = "none";
            });
    }
    
    
});
