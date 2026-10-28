import PropTypes from 'prop-types';
import './StatusOnline.css';

// Bolinha verde "online" ou cinza "offline" ao lado do nome do treinador
function StatusOnline({ online }) {
  return (
    <span className="status-online" data-online={online}>
      {online ? 'online' : 'offline'}
    </span>
  );
}

StatusOnline.propTypes = {
  online: PropTypes.bool.isRequired,
};

export default StatusOnline;
