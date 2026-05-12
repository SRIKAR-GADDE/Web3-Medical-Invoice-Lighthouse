import React, { Component } from 'react';
import './Files.css';
import * as AppGeneral from '../socialcalc/AppGeneral';
import { Files as File, Local } from '../storage/LocalStorage.js';
import { DATA } from '../app-data.js';
import { create as createClient } from '@web3-storage/w3up-client';

class Files extends Component {
  constructor(props) {
    super(props);
    this.store = new Local();
    this.state = {
      files: this.store._getAllFiles(),
      modal: null,
      listFiles: false,
      showAlert: false,
      currentKey: null,
      fileSource: 'local', // 'local' or 'ipfs'
      ipfsFiles: [],
      ipfsFilesLoaded: false,
      loading: false,
      showMoveAlert: false,
      fileToMove: null,
      userEmail: '',
      showEmailInput: false,
      ipfsClient: null,
      userSpace: '',
      showSpaceSetup: false,
      spaceDid: '',
      isSpaceCreating: false
    };
  }

  // Initialize IPFS client
  initializeIpfsClient = async (email, space) => {
    try {
      this.setState({ loading: true });
      const client = await createClient();
      const account = await client.login(email);
      const currSpace = await client.setCurrentSpace(space);
      
      this.setState({
        ipfsClient: client,
        userSpace: space,
        userEmail: email
      });
      
      localStorage.setItem('ipfsUserEmail', email);
      localStorage.setItem('ipfsUserSpace', space);
      
      return client;
    } catch (error) {
      console.error('Error initializing IPFS client:', error);
      alert('Failed to initialize IPFS client. Please try again.');
      return null;
    } finally {
      this.setState({ loading: false });
    }
  };

  // Create a new space for the user
  createUserSpace = async () => {
    const { ipfsClient, userEmail } = this.state;
    if (!ipfsClient) return;
    
    try {
      this.setState({ isSpaceCreating: true });
      const space = await ipfsClient.createSpace(`${userEmail}'s Space`);
      const spaceDid = space.did();
      
      await ipfsClient.setCurrentSpace(spaceDid);
      
      this.setState({
        userSpace: space,
        spaceDid,
        showSpaceSetup: false
      });
      
      localStorage.setItem('ipfsUserSpace', spaceDid);
      alert('Your IPFS space has been created successfully!');
      
      return space;
    } catch (error) {
      console.error('Error creating space:', error);
      alert('Failed to create IPFS space. Please try again.');
      return null;
    } finally {
      this.setState({ isSpaceCreating: false });
    }
  };

  // Fetch files from IPFS
  fetchIPFSFiles = async () => {
    const { ipfsClient, userSpace } = this.state;
    
    if (!ipfsClient || !userSpace) {
      alert('Please set up your IPFS account first');
      this.setState({ showEmailInput: true });
      return;
    }
    if (this.state.loading) return;

    this.setState({ loading: true });
    try {
      const uploads = await ipfsClient.capability.upload.list();
      const filesPromises = uploads.results.map(async (upload) => {
        try {
          const url = `https://${upload.root.toString()}.ipfs.w3s.link`;
          const response = await fetch(url);
          if (!response.ok) return null;
          
          const directoryListing = await response.text();
          const fileLinks = directoryListing.match(/<a href="([^"]+)"/g) || [];
          
          const files = await Promise.all(fileLinks.map(async (link) => {
            const fileName = link.match(/<a href="([^"]+)"/)[1].split('/').pop();
            if (fileName.endsWith('.json')) {
              const fileUrl = `${url}/${fileName}`;
              try {
                const fileResponse = await fetch(fileUrl);
                if (fileResponse.ok) {
                  const fileData = await fileResponse.json();
                  return {
                    name: fileData.name,
                    created: fileData.created,
                    modified: fileData.modified,
                    cid: upload.root.toString(),
                    path: fileName
                  };
                }
              } catch (e) {
                console.error(`Error fetching file ${fileName}:`, e);
              }
            }
            return null;
          }));
          
          return files.filter(f => f !== null);
        } catch (e) {
          console.error(`Error processing upload ${upload.root.toString()}:`, e);
          return null;
        }
      });
      
      const allFiles = (await Promise.all(filesPromises))
        .filter(f => f !== null)
        .flat();
      
        this.setState({ 
          ipfsFiles: allFiles,
          ipfsFilesLoaded: true
        });
    } catch (error) {
      console.error('Error fetching IPFS files:', error);
    } finally {
      this.setState({ loading: false });
    }
  };

  // Retrieve file from IPFS
  retrieveFromIPFS = async (cid, path) => {
    const { ipfsClient } = this.state;
    if (!ipfsClient) {
      alert('Please set up your IPFS account first');
      return null;
    }
    
    try {
      const url = `https://${cid}.ipfs.w3s.link/${path}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch file: ${response.statusText}`);

      const fileData = await response.json();
      console.log(fileData);
      
      return fileData;
    } catch (error) {
      console.error('IPFS Retrieval Error:', error);
      throw error;
    }
  };

  // Move file from IPFS to local storage
  moveToLocalStorage = async (file) => {
    try {
      const fileData = await this.retrieveFromIPFS(file.cid, file.path);
      console.log(fileData);
      const localFile = new File(
        fileData.created,
        fileData.modified,
        fileData.content,
        fileData.name,
        fileData.password || ""
      );
      console.log(localFile);
      
      
      this.store._saveFile(localFile);
      this.props.updateSelectedFile(fileData.name);
      return true;
    } catch (error) {
      console.error('Error moving file to localStorage:', error);
      return false;
    }
  };

  editFile = (key) => {
    const data = this.store._getFile(key);
    AppGeneral.viewFile(key, decodeURIComponent(data.content));
    this.props.updateSelectedFile(key);
  };

  deleteFile = (key) => {
    this.setState({ showAlert: true, currentKey: key });
  };

  loadDefault = () => {
    const msc = DATA['home'][AppGeneral.getDeviceType()]['msc'];
    AppGeneral.viewFile('default', JSON.stringify(msc));
    this.props.updateSelectedFile('default');
  };

  handleEmailSubmit = async () => {
    const { userEmail, userSpace } = this.state;
    await this.initializeIpfsClient(userEmail, userSpace);
    this.setState({ showEmailInput: false });
  };

  componentDidMount() {
    const savedEmail = localStorage.getItem('ipfsUserEmail');
    const savedSpace = localStorage.getItem('ipfsUserSpace');
    
    if (savedEmail && savedSpace) {
      this.setState({ userEmail: savedEmail, userSpace: savedSpace });
      this.initializeIpfsClient(savedEmail, savedSpace).then(client => {
        if (client && savedSpace) {
          client.setCurrentSpace(savedSpace).catch(console.error);
        }
      });
    }
  }

  componentDidUpdate(prevProps, prevState) {
    if (this.state.fileSource === 'ipfs' && 
        this.state.ipfsClient && 
        this.state.userSpace &&
        !this.state.ipfsFilesLoaded &&
        !this.state.loading &&
        this.state.ipfsFiles.length === 0) {
      this.fetchIPFSFiles();
    }
  }

  _formatDate = (date) => {
    return new Date(date).toLocaleString();
  };

  renderFileList() {
    const { 
      fileSource, 
      files, 
      ipfsFiles, 
      showEmailInput, 
      userEmail, 
      userSpace,
      loading,
      showSpaceSetup,
      ipfsClient
    } = this.state;

    if (fileSource === 'local') {
      const fileList = Object.keys(files).map((key) => (
        <div key={key} className="file-item">
          <span className="file-name">{key}</span>
          <span className="file-date">{this._formatDate(files[key].modified || files[key])}</span>
          <button onClick={() => this.editFile(key)}>Edit</button>
          <button onClick={() => this.deleteFile(key)}>Delete</button>
        </div>
      ));
      
      return (
        <div className="file-list">
          {fileList.length > 0 ? fileList : <div>No local files found</div>}
        </div>
      );
    } else {
      // IPFS files section
      if (showEmailInput) {
        return (
          <div className="ipfs-setup">
            <h3>Set Up Your IPFS Account</h3>
            <p>Enter your email to create or access your IPFS space</p>
            <input
              type="email"
              placeholder="Your email address"
              value={userEmail}
              onChange={e => this.setState({ userEmail: e.target.value })}
            />
            <input
              type="text"
              placeholder="Your Space DID KEY"
              value={userSpace}
              onChange={e => this.setState({ userSpace: e.target.value })}
            />
            <button 
              onClick={this.handleEmailSubmit}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Continue'}
            </button>
          </div>
        );
      } else if (showSpaceSetup) {
        return (
          <div className="ipfs-setup">
            <h3>Create Your IPFS Space</h3>
            <p>You don't have any IPFS spaces yet. Create one to start storing your files.</p>
            <button 
              onClick={this.createUserSpace}
              disabled={this.state.isSpaceCreating}
            >
              {this.state.isSpaceCreating ? 'Creating...' : 'Create Space'}
            </button>
          </div>
        );
      } else if (!ipfsClient || !userSpace) {
        return (
          <div className="ipfs-setup">
            <h3>IPFS Setup Required</h3>
            <p>Please set up your IPFS account to access your files.</p>
            <button onClick={() => this.setState({ showEmailInput: true })}>
              Set Up IPFS Account
            </button>
          </div>
        );
      } else {
        // Show IPFS files
        const fileList = ipfsFiles.map((file, index) => (
          <div key={`${file.cid}-${index}`} className="file-item">
            <span className="file-name">{file.name}</span>
            <span className="file-date">{this._formatDate(file.modified)}</span>
            <button onClick={() => this.editFile(file.name)}>Edit</button>
            <button onClick={() => {
              this.setState({ fileToMove: file, showMoveAlert: true });
            }}>Download</button>
          </div>
        ));
        
        return (
          <div className="ipfs-files">
            <div className="ipfs-info">
              <p><strong>Your IPFS Space:</strong> {userSpace ? userSpace.substring(0, 20) + '...' : 'Not set'}</p>
              <button 
                onClick={() => {
                  this.setState({ ipfsFilesLoaded: false }, () => {
                    this.fetchIPFSFiles();
                  });
                }}
                disabled={loading}
              >
                {loading ? 'Refreshing...' : 'Refresh IPFS Files'}
              </button>
            </div>
            
            <div className="file-list">
              {loading ? (
                <div className="loading">Loading files from IPFS...</div>
              ) : (
                fileList.length > 0 ? fileList : <div>No IPFS files found</div>
              )}
            </div>
          </div>
        );
      }
    }
  }

  render() {
    const { listFiles, fileSource, showAlert, currentKey, showMoveAlert, fileToMove } = this.state;
    const files = this.store._getAllFiles();

    return (
      <div className="files-container">

          <div className="file-manager-modal">
            <div className="file-source-tabs">
              <button
                className={fileSource === 'local' ? 'active' : ''}
                onClick={() => this.setState({ fileSource: 'local' })}
              >
                Local Files
              </button>
              <button
                className={fileSource === 'ipfs' ? 'active' : ''}
                onClick={() => this.setState({ fileSource: 'ipfs' })}
              >
                IPFS Files
              </button>
            </div>
            
            {this.renderFileList()}
            
            <button
              className="close-button"
              onClick={() => {
                this.props.toggleListFiles();
                this.setState({ 
                  fileSource: 'local'
                });
              }}
            >
              Close
            </button>
          </div>

        {showAlert && (
          <div className="alert-modal">
            <div className="alert-content">
              <p>Do you want to delete the {currentKey} file?</p>
              <div className="alert-buttons">
                <button onClick={() => this.setState({ showAlert: false })}>Cancel</button>
                <button onClick={() => {
                  this.store._deleteFile(currentKey);
                  this.loadDefault();
                  this.setState({ 
                    files: this.store._getAllFiles(),
                    showAlert: false,
                    currentKey: null
                  });
                }}>Delete</button>
              </div>
            </div>
          </div>
        )}

        {showMoveAlert && (
          <div className="alert-modal">
            <div className="alert-content">
              <p>Do you want to move "{fileToMove?.name}" to your local storage?</p>
              <div className="alert-buttons">
                <button onClick={() => this.setState({ showMoveAlert: false })}>Cancel</button>
                <button onClick={async () => {
                  const success = await this.moveToLocalStorage(fileToMove);
                  if (success) {
                    alert(`File "${fileToMove.name}" has been moved to local storage.`);
                  } else {
                    alert(`Failed to move file "${fileToMove.name}" to local storage.`);
                  }
                  this.setState({ 
                    showMoveAlert: false,
                    fileToMove: null,
                    files: this.store._getAllFiles()
                  });
                }}>Move</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
}

export default Files;