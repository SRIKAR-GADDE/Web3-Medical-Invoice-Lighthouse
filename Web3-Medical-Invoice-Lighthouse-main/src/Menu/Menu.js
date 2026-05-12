import React, { Component } from "react";
import "./Menu.css";
import * as AppGeneral from "../socialcalc/AppGeneral";
import { Files, Local } from "../storage/LocalStorage.js";
import { DATA } from "../app-data.js";
import { create } from "@web3-storage/w3up-client";
import lighthouse from '@lighthouse-web3/sdk';
import { ethers } from "ethers";
import { 
  MEDT_TOKEN_ADDRESSES, 
  MEDI_INVOICE_ADDRESSES, 
  SUPPORTED_NETWORKS, 
  TOKEN_COST 
} from "../utils/constants.js";
import meditokenabi from "../utils/meditokenabi.json";
import medinvoiceabi from "../utils/medinvoiceabi.json";

class Menu extends Component {
  constructor(props) {
    super(props);
    this.store = new Local(this.props.file);
    this.state = {
      numOfTokens: 0,
      isUploading: false,
      uploadMethod: 'storacha', // Default upload method
      showUploadMethodModal: false,
      showStorachaSetupModal: false,
      showSaveSuccessModal: false,
      saveSuccessDetails: {
        filename: '',
        cid: '',
        gatewayUrl: ''
      },
      selectedUploadMethod: null
    };
    this.handleNetworkChange = this.handleNetworkChange.bind(this);
  }

  componentDidMount() {
    this.fetchUserTokens();
    
    if (window.ethereum) {
      window.ethereum.on('chainChanged', this.handleNetworkChange);
    }
  }

  componentWillUnmount() {
    if (window.ethereum) {
      window.ethereum.removeListener('chainChanged', this.handleNetworkChange);
    }
  }

  handleNetworkChange(chainId) {
    console.log('Network changed to:', chainId);
    this.fetchUserTokens();
  }

  async getNetworkKey(provider){
    const network = await provider.getNetwork();
    const chainIdHex = "0x" + network.chainId.toString(16);
    
    for (const [network, data] of Object.entries(SUPPORTED_NETWORKS)) {
      if (data.chainId === chainIdHex) {
        return network;
      }
    }
    throw new Error('Unsupported network');
  }

  async getContractAddresses(provider){
    const networkKey = await this.getNetworkKey(provider);
    return {
      mediToken: MEDT_TOKEN_ADDRESSES[networkKey],
      mediInvoice: MEDI_INVOICE_ADDRESSES[networkKey]
    };
  }

  async fetchUserTokens(){
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const { mediInvoice } = await this.getContractAddresses(provider);
      
      const contract = new ethers.Contract(
        mediInvoice,
        medinvoiceabi,
        signer
      );
      
      const userTokens = await contract.getUserTokens();
      console.log("User tokens: ", Number(userTokens));
      this.setState({ numOfTokens: Number(userTokens) / 10 ** 18 });
    } catch (error) {
      console.error("Error fetching user tokens:", error);
    }
  }

  async updateTokenBalance(operation){
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const { mediToken, mediInvoice } = await this.getContractAddresses(provider);
      
      const contract = new ethers.Contract(
        mediToken,
        meditokenabi,
        signer
      );

      const tx = await contract.transfer(
        mediInvoice,
        ethers.utils.parseEther(TOKEN_COST[operation])
      );
      
      await tx.wait();
      await this.fetchUserTokens();
    } catch (error) {
      console.error("Error transferring tokens:", error);
      throw error;
    }
  }

  isStorachaAccountSetup() {
    const savedEmail = localStorage.getItem('ipfsUserEmail');
    const savedSpace = localStorage.getItem('ipfsUserSpace');
    return !!(savedEmail && savedSpace);
  }

  promptUploadMethod() {
    return new Promise((resolve) => {
      this.setState({ 
        showUploadMethodModal: true,
        selectedUploadMethod: null 
      }, () => {
        this.resolveUploadMethod = (method) => {
          this.setState({ 
            showUploadMethodModal: false,
            selectedUploadMethod: method 
          });
          resolve(method);
        };
      });
    });
  }

  promptStorachaAccountSetup() {
    return new Promise((resolve) => {
      this.setState({ 
        showStorachaSetupModal: true 
      }, () => {
        this.resolveStorachaSetup = (action) => {
          this.setState({ 
            showStorachaSetupModal: false 
          });
          resolve(action);
        };
      });
    });
  }

  async chooseAndUploadToIPFS(fileData) {
    const uploadMethod = await this.promptUploadMethod();
    
    try {
      this.setState({ 
        isUploading: true,
        uploadMethod: uploadMethod 
      });

      let cid;
      switch(uploadMethod) {
        case 'storacha':
          if (!this.isStorachaAccountSetup()) {
            await this.promptStorachaAccountSetup();
            throw new Error('Storacha account not set up');
          }
          cid = await this.uploadToIPFSStoracha(fileData);
          break;
        case 'lighthouse':
          cid = await this.uploadToIpfsLighthouse(fileData);
          break;
        default:
          throw new Error('Invalid upload method selected');
      }

      return cid;
    } catch (error) {
      console.error('IPFS Upload Error:', error);
      throw error;
    } finally {
      this.setState({ isUploading: false });
    }
  }

  async uploadToIPFSStoracha(fileData) {
    try {
      const savedEmail = localStorage.getItem('ipfsUserEmail');
      const savedSpace = localStorage.getItem('ipfsUserSpace');
      
      if (!savedEmail || !savedSpace) {
        throw new Error('IPFS account not set up. Please set up your IPFS account in the Files section first.');
      }
      
      const client = await create();
      const account = await client.login(savedEmail);
      await client.setCurrentSpace(savedSpace);
      
      const formattedFile = new File(
        [JSON.stringify(fileData)],
        `${fileData.name}.json`,
        { type: 'application/json' }
      );
      
      const cid = await client.uploadDirectory([formattedFile]);
      return cid.toString();
    } catch (error) {
      console.error('Storacha Upload Error:', error);
      throw error;
    }
  }

  async uploadToIpfsLighthouse(fileData) {
    try {
      const file = new File(
        [JSON.stringify(fileData)], 
        `${fileData.name}.json`, 
        { type: 'application/json' }
      );

      const API_KEY = "61d16b3b.f3d3588afcfd48afa1108c754628cc6e";
      
      const output = await lighthouse.upload(
        [file], 
        API_KEY, 
        null, 
        (progressEvent) => {
          console.log('Upload progress:', progressEvent);
        }
      );

      console.log('File Status:', output);
      const cid = output.data.Hash;
      
      return cid;
    } catch (error) {
      console.error('Lighthouse Upload Error:', error);
      throw error;
    }
  }

  doPrint = async () => {
    if (this.state.numOfTokens < TOKEN_COST.PRINT) {
      window.alert(`You need at least ${TOKEN_COST.PRINT} PPT token to print`);
      return;
    }

    try {
      await this.updateTokenBalance('PRINT');
      const content = AppGeneral.getCurrentHTMLContent();
      var printWindow = window.open("", "", "left=100,top=100");
      printWindow.document.write(content);
      printWindow.print();
      printWindow.close();
    } catch (error) {
      window.alert("Failed to process token payment");
    }
  }

  doSave = async () => {
    if (this.props.file === "default") {
      window.alert(`Cannot update ${this.props.file} file!`);
      return;
    }

    if (this.state.numOfTokens < TOKEN_COST.SAVE) {
      window.alert(`You need at least ${TOKEN_COST.SAVE} PPT token to save`);
      return;
    }

    try {
      await this.updateTokenBalance('SAVE');
      const content = encodeURIComponent(AppGeneral.getSpreadsheetContent());
      const data = this.store._getFile(this.props.file);
      const file = new Files(
        data.created,
        new Date().toString(),
        content,
        this.props.file
      );
      this.store._saveFile(file);
      this.props.updateSelectedFile(this.props.file);
      window.alert(`File ${this.props.file} updated successfully!`);
    } catch (error) {
      window.alert("Failed to process token payment");
    }
  }

  doSaveAs = async () => {
    const filename = window.prompt("Enter filename:");
    
    if (!filename) return;

    if (this.state.numOfTokens < TOKEN_COST.SAVE_AS) {
      window.alert(`You need at least ${TOKEN_COST.SAVE_AS} PPT token to save`);
      return;
    }

    if (this._validateName(filename)) {
      try {
        const content = encodeURIComponent(AppGeneral.getSpreadsheetContent());
        const fileData = {
          name: filename,
          content: content,
          created: new Date().toString(),
          modified: new Date().toString(),
        };

        const cid = await this.chooseAndUploadToIPFS(fileData);
        await this.updateTokenBalance('SAVE_AS');

        const file = new Files(
          fileData.created,
          fileData.modified,
          content,
          filename
        );
        this.store._saveFile(file);
        this.props.updateSelectedFile(filename);
        
        const gatewayUrl = this.state.uploadMethod === 'storacha' 
          ? `https://w3s.link/ipfs/${cid}` 
          : `https://gateway.lighthouse.storage/ipfs/${cid}`;
        
        this.showSaveSuccessModal(filename, cid, gatewayUrl);

        console.log(cid, gatewayUrl);
        
      } catch (error) {
        console.error("Save As error:", error);
        window.alert(`Error saving file: ${error.message}`);
      }
    } else {
      window.alert(`Invalid filename: ${filename}`);
    }
  }

  showSaveSuccessModal = (filename, cid, gatewayUrl) => {
    this.setState({
      showSaveSuccessModal: true,
      saveSuccessDetails: {
        filename,
        cid,
        gatewayUrl
      }
    });
  }

  closeSaveSuccessModal = () => {
    this.setState({
      showSaveSuccessModal: false,
      saveSuccessDetails: {
        filename: '',
        cid: '',
        gatewayUrl: ''
      }
    });
  }

  render() {
    const { 
      showUploadMethodModal, 
      showStorachaSetupModal,
      showSaveSuccessModal,
      saveSuccessDetails,
      numOfTokens 
    } = this.state;

    return (
      <div className="Menu">
        <button onClick={this.doSave}> Save </button>
        <button onClick={this.doSaveAs}> Save As </button>
        <button onClick={this.doPrint}> Print </button>
        <button onClick={() => this.newFile()}> New File </button>
        <div>Tokens you Own: {numOfTokens.toFixed(2)}</div>

        {/* Upload Method Selection Modal */}
        {showUploadMethodModal && (
          <div className="alert-modal">
            <div className="alert-content">
              <h3>Choose IPFS Upload Method</h3>
              <p>Select the service you want to use for uploading your file:</p>
              <div className="alert-buttons">
                <button 
                  onClick={() => this.resolveUploadMethod('storacha')}
                  className="upload-method-btn"
                >
                  Storacha
                </button>
                <button 
                  onClick={() => this.resolveUploadMethod('lighthouse')}
                  className="upload-method-btn"
                >
                  Lighthouse
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Storacha Account Setup Modal */}
        {showStorachaSetupModal && (
          <div className="alert-modal">
            <div className="alert-content">
              <h3>Storacha IPFS Account Not Set Up</h3>
              <p>Your Storacha IPFS account is not configured. 
                 You need to set up your account in the List Files section before uploading.</p>
              <div className="alert-buttons">
                <button 
                  onClick={() => this.resolveStorachaSetup('cancel')}
                  className="cancel-btn"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Save Success Modal */}
        {showSaveSuccessModal && (
          <div className="alert-modal">
            <div className="alert-content">
              <h3>File Saved Successfully</h3>
              <div className="save-success-details">
                <p><strong>Filename:</strong> {saveSuccessDetails.filename}</p>
                <p><strong>IPFS CID:</strong> 
                  <span className="cid-display">{saveSuccessDetails.cid}</span>
                </p>
                <p><strong>Gateway URL:</strong> 
                  <a 
                    href={saveSuccessDetails.gatewayUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{wordBreak : "break-all"}}
                  >
                    {saveSuccessDetails.gatewayUrl}
                  </a>
                </p>
              </div>
              <div className="alert-buttons">
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(saveSuccessDetails.cid)
                      .then(() => {
                        alert('CID copied to clipboard!');
                      })
                      .catch(err => {
                        console.error('Failed to copy CID:', err);
                      });
                  }}
                  className="copy-cid-btn"
                >
                  Copy CID
                </button>
                <button 
                  onClick={this.closeSaveSuccessModal}
                  className="close-btn"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  newFile() {
    if (this.props.file !== "default") {
      const content = encodeURIComponent(AppGeneral.getSpreadsheetContent());
      const data = this.store._getFile(this.props.file);
      const file = new Files(
        data.created,
        new Date().toString(),
        content,
        this.props.file
      );
      this.store._saveFile(file);
      this.props.updateSelectedFile(this.props.file);
    }
    const msc = DATA["home"][AppGeneral.getDeviceType()]["msc"];
    AppGeneral.viewFile("default", JSON.stringify(msc));
    this.props.updateSelectedFile("default");
  }

  _validateName(filename) {
    filename = filename.trim();
    if (filename === "default" || filename === "Untitled") {
      return false;
    } else if (filename === "" || !filename) {
      return false;
    } else if (filename.length > 30) {
      return false;
    } else if (/^[a-zA-Z0-9- ]*$/.test(filename) === false) {
      return false;
    }
    return true;
  }
}

export default Menu;